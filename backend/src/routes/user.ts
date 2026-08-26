import express from "express";
import { prisma } from "../lib/prisma";
import { ensureProfile } from "../lib/services/portfolio";
import { asyncHandler, ApiError } from "../lib/http";
import { parse, v } from "../lib/validate";
import { requireAuth, requireRealSession } from "../middleware/auth";
import { audit } from "../lib/audit";

const router = express.Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const full = await prisma.user.findUnique({ where: { id: u.id } });
    if (!full) throw ApiError.notFound("User not found");
    return res.json({
      id: full.id,
      deviceId: full.deviceId,
      username: full.username,
      email: full.email,
      phone: full.phone,
      fullName: full.fullName,
      role: full.role,
      kycStatus: full.kycStatus,
      emailVerified: full.emailVerified,
      phoneVerified: full.phoneVerified,
      twoFactorEnabled: full.twoFactorEnabled,
      walletInr: full.walletInr,
      walletUsd: full.walletUsd,
      createdAt: full.createdAt,
    });
  })
);

router.get(
  "/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await ensureProfile(req.user!.id);
    return res.json({
      ...profile,
      preferredMarkets: JSON.parse(profile.preferredMarkets || "[]"),
      preferredAssets: JSON.parse(profile.preferredAssets || "[]"),
    });
  })
);

router.put(
  "/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(
      {
        experience: v.optional(v.enumOf(["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const)),
        riskTolerance: v.optional(v.enumOf(["CONSERVATIVE", "MODERATE", "AGGRESSIVE"] as const)),
        horizonYears: v.optional(v.number({ min: 0, max: 60, int: true })),
        monthlyInvestment: v.optional(v.number({ min: 0 })),
        preferredMarkets: v.optional(v.stringArray({ max: 10 })),
        preferredAssets: v.optional(v.stringArray({ max: 10 })),
        goalsSummary: v.optional(v.string({ max: 500 })),
        baseCurrency: v.optional(v.enumOf(["INR", "USD"] as const)),
        theme: v.optional(v.enumOf(["dark", "light", "system"] as const)),
        onboardingCompleted: v.optional(v.boolean()),
        notifyEmail: v.optional(v.boolean()),
        notifyPush: v.optional(v.boolean()),
        notifySms: v.optional(v.boolean()),
      },
      req.body
    );

    await ensureProfile(req.user!.id);
    const updated = await prisma.userProfile.update({
      where: { userId: req.user!.id },
      data: {
        ...body,
        preferredMarkets: body.preferredMarkets ? JSON.stringify(body.preferredMarkets) : undefined,
        preferredAssets: body.preferredAssets ? JSON.stringify(body.preferredAssets) : undefined,
      },
    });
    return res.json({ ...updated, preferredMarkets: JSON.parse(updated.preferredMarkets || "[]"), preferredAssets: JSON.parse(updated.preferredAssets || "[]") });
  })
);

router.put(
  "/details",
  requireRealSession,
  asyncHandler(async (req, res) => {
    const { fullName } = parse({ fullName: v.optional(v.string({ min: 1, max: 120 })) }, req.body);
    const updated = await prisma.user.update({ where: { id: req.user!.id }, data: { fullName } });
    return res.json({ success: true, fullName: updated.fullName });
  })
);

// ── KYC (status tracking only — no document verification here; wire a
// licensed KYC/AML provider before treating this as compliant onboarding) ──
router.post(
  "/kyc/submit",
  requireRealSession,
  asyncHandler(async (req, res) => {
    await prisma.user.update({ where: { id: req.user!.id }, data: { kycStatus: "PENDING" } });
    await audit(req, "user.kyc_submitted");
    return res.json({ success: true, kycStatus: "PENDING", note: "KYC document verification is not wired to a licensed provider in this environment — status is illustrative only." });
  })
);

// ── Bank accounts (metadata only — never the full account number) ────
router.get(
  "/bank-accounts",
  requireRealSession,
  asyncHandler(async (req, res) => {
    const accounts = await prisma.bankAccount.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } });
    return res.json(accounts);
  })
);

router.post(
  "/bank-accounts",
  requireRealSession,
  asyncHandler(async (req, res) => {
    const body = parse(
      {
        bankName: v.string({ min: 2, max: 80 }),
        accountNumber: v.string({ min: 6, max: 34 }),
        ifsc: v.string({ min: 6, max: 15 }),
        accountType: v.withDefault(v.enumOf(["SAVINGS", "CURRENT"] as const), "SAVINGS"),
        holderName: v.string({ min: 2, max: 120 }),
      },
      req.body
    );
    const accountLast4 = body.accountNumber.slice(-4);
    const account = await prisma.bankAccount.create({
      data: { userId: req.user!.id, bankName: body.bankName, accountLast4, ifsc: body.ifsc.toUpperCase(), accountType: body.accountType, holderName: body.holderName },
    });
    await audit(req, "user.bank_account_added", { entity: "BankAccount", entityId: account.id });
    return res.json(account);
  })
);

router.delete(
  "/bank-accounts/:id",
  requireRealSession,
  asyncHandler(async (req, res) => {
    await prisma.bankAccount.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    return res.json({ success: true });
  })
);

export default router;
