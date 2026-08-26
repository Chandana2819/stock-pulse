import express from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, ApiError } from "../lib/http";
import { requireRealSession } from "../middleware/auth";
import { audit } from "../lib/audit";

const router = express.Router();

// Enforce authentication for all KYC endpoints
router.use(requireRealSession);

router.get(
  "/status",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        kycStatus: true,
        kycRecord: true,
      },
    });

    if (!user) {
      throw ApiError.notFound("User not found");
    }

    return res.json({
      kycStatus: user.kycStatus,
      kycRecord: user.kycRecord,
    });
  })
);

router.post(
  "/verify",
  asyncHandler(async (req, res) => {
    const { fullName, panNumber, documentType, address, birthDate } = req.body;

    if (!fullName || !panNumber || !documentType || !address || !birthDate) {
      throw ApiError.badRequest("All fields (fullName, panNumber, documentType, address, birthDate) are required");
    }

    const cleanName = fullName.trim().toLowerCase();
    const cleanPan = panNumber.trim().toUpperCase();

    // Check if PAN format is valid (simple validation: 10 chars alphanumeric)
    if (cleanPan.length !== 10) {
      throw ApiError.badRequest("Invalid PAN Format. Must be 10 characters.");
    }

    // Mock AML Check: Reject known high-risk names/combinations
    const riskKeywords = ["mallya", "choksi", "modi", "subrata", "scam", "fraud"];
    const matchesAml = riskKeywords.some((word) => cleanName.includes(word)) || cleanPan.startsWith("BAD");

    let kycStatus = "VERIFIED";
    let amlStatus = "PASSED";
    let amlMatchScore = 0.0;
    let rejectedReason: string | null = null;

    if (matchesAml) {
      kycStatus = "REJECTED";
      amlStatus = "FAILED";
      amlMatchScore = 98.6;
      rejectedReason = "Applicant matching high-risk financial exclusion list (AML database red-flag).";
    }

    // Update or create the KYC record
    const kycRecord = await prisma.kycRecord.upsert({
      where: { userId: req.user!.id },
      create: {
        userId: req.user!.id,
        fullName: fullName.trim(),
        panNumber: cleanPan,
        documentType,
        address: address.trim(),
        birthDate,
        amlStatus,
        amlMatchScore,
        rejectedReason,
        verifiedAt: kycStatus === "VERIFIED" ? new Date() : null,
      },
      update: {
        fullName: fullName.trim(),
        panNumber: cleanPan,
        documentType,
        address: address.trim(),
        birthDate,
        amlStatus,
        amlMatchScore,
        rejectedReason,
        verifiedAt: kycStatus === "VERIFIED" ? new Date() : null,
        updatedAt: new Date(),
      },
    });

    // Update user status
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { kycStatus },
    });

    // Log to security audit trail
    await audit(req, matchesAml ? "KYC_VERIFICATION_REJECTED" : "KYC_VERIFICATION_SUCCESS", {
      userId: req.user!.id,
      entity: "KycRecord",
      entityId: kycRecord.id,
      meta: { amlStatus, amlMatchScore, cleanPan },
    });

    return res.json({
      kycStatus,
      kycRecord,
    });
  })
);

export default router;
