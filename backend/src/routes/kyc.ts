import express from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, ApiError } from "../lib/http";
import { requireRealSession } from "../middleware/auth";
import { audit } from "../lib/audit";
import { PanProvider } from "../services/kyc/panProvider";
import { AadhaarProvider } from "../services/kyc/aadhaarProvider";
import { PassportProvider } from "../services/kyc/passportProvider";

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
  "/verify/pan",
  asyncHandler(async (req, res) => {
    const { pan } = req.body;
    if (!pan || !pan.trim()) {
      throw ApiError.badRequest("PAN number is required.");
    }
    const cleanPan = pan.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(cleanPan)) {
      throw ApiError.badRequest("Invalid PAN Card format. Expected format is ABCDE1234F.");
    }

    const provider = new PanProvider();
    const result = await provider.verify(cleanPan);
    return res.json(result);
  })
);

router.post(
  "/verify/aadhaar",
  asyncHandler(async (req, res) => {
    const { aadhaar } = req.body;
    if (!aadhaar || !aadhaar.trim()) {
      throw ApiError.badRequest("Aadhaar number is required.");
    }
    const cleanAadhaar = aadhaar.replace(/\s+/g, "");
    if (!/^[0-9]{12}$/.test(cleanAadhaar)) {
      throw ApiError.badRequest("Invalid Aadhaar Card format. Must be exactly 12 digits.");
    }

    const provider = new AadhaarProvider();
    const result = await provider.verify(cleanAadhaar);
    return res.json(result);
  })
);

router.post(
  "/verify/passport",
  asyncHandler(async (req, res) => {
    const { passport } = req.body;
    if (!passport || !passport.trim()) {
      throw ApiError.badRequest("Passport number is required.");
    }
    const cleanPassport = passport.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z0-9]{8,9}$/.test(cleanPassport)) {
      throw ApiError.badRequest("Invalid Passport format. Must be 8-9 alphanumeric characters.");
    }

    const provider = new PassportProvider();
    const result = await provider.verify(cleanPassport);
    return res.json(result);
  })
);

router.post(
  "/verify",
  asyncHandler(async (req, res) => {
    const { fullName, dateOfBirth, documentType, documentNumber, consent } = req.body;

    // 1. Consent Validation
    if (consent !== true) {
      throw ApiError.badRequest("Consent is required to proceed.");
    }

    // 2. Full Name Validation
    if (!fullName || !fullName.trim()) {
      throw ApiError.badRequest("Full Name is required.");
    }
    const cleanName = fullName.trim();
    if (!/^[a-zA-Z\s]+$/.test(cleanName)) {
      throw ApiError.badRequest("Full Name must contain only letters and spaces.");
    }

    // 3. Document Type Validation
    if (!documentType || !["PAN", "AADHAAR", "PASSPORT"].includes(documentType)) {
      throw ApiError.badRequest("Invalid or missing Document Type.");
    }

    // 4. Document Number Validation
    if (!documentNumber || !documentNumber.trim()) {
      throw ApiError.badRequest("Document Number is required.");
    }
    const cleanDocNum = documentNumber.replace(/\s+/g, "").toUpperCase();

    if (documentType === "PAN") {
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(cleanDocNum)) {
        throw ApiError.badRequest("Invalid PAN Card format. Expected format is ABCDE1234F.");
      }
    } else if (documentType === "AADHAAR") {
      if (!/^[0-9]{12}$/.test(cleanDocNum)) {
        throw ApiError.badRequest("Invalid Aadhaar Card format. Must be exactly 12 digits.");
      }
    } else if (documentType === "PASSPORT") {
      if (!/^[A-Z0-9]{8,9}$/.test(cleanDocNum)) {
        throw ApiError.badRequest("Invalid Passport format. Must be 8-9 alphanumeric characters.");
      }
    }

    // 5. Date of Birth Validation
    if (!dateOfBirth || !dateOfBirth.trim()) {
      throw ApiError.badRequest("Date of Birth is required.");
    }
    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) {
      throw ApiError.badRequest("Invalid Date of Birth format.");
    }
    if (dob > new Date()) {
      throw ApiError.badRequest("Date of Birth cannot be in the future.");
    }

    // Mask sensitive document numbers (e.g. Aadhaar) for compliance
    let savedDocNumber = cleanDocNum;
    if (documentType === "AADHAAR") {
      savedDocNumber = `XXXX-XXXX-${cleanDocNum.slice(-4)}`;
    }

    const kycStatus = "PENDING";
    const amlStatus = "PENDING";
    const amlMatchScore = 0.0;
    const rejectedReason = null;

    // Update or create the KYC record
    const kycRecord = await prisma.kycRecord.upsert({
      where: { userId: req.user!.id },
      create: {
        userId: req.user!.id,
        fullName: cleanName,
        panNumber: savedDocNumber, // Save document number in the panNumber column
        documentType,
        address: "NOT_PROVIDED", // Default placeholder to satisfy database schema
        birthDate: dateOfBirth.trim(),
        amlStatus,
        amlMatchScore,
        rejectedReason,
        verifiedAt: null,
      },
      update: {
        fullName: cleanName,
        panNumber: savedDocNumber,
        documentType,
        address: "NOT_PROVIDED",
        birthDate: dateOfBirth.trim(),
        amlStatus,
        amlMatchScore,
        rejectedReason,
        verifiedAt: null,
        updatedAt: new Date(),
      },
    });

    // Update user status to PENDING
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { kycStatus },
    });

    // Log to security audit trail (exclude raw document numbers)
    await audit(req, "KYC_VERIFICATION_SUBMITTED", {
      userId: req.user!.id,
      entity: "KycRecord",
      entityId: kycRecord.id,
      meta: { amlStatus, amlMatchScore, documentType },
    });

    return res.json({
      kycStatus,
      kycRecord,
    });
  })
);

export default router;
