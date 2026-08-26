import express from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { generateSalt, hashPasswordSecure, verifyPassword, createSessionToken, generateOtp, hashOtp, generateTotpSecret, verifyTotp } from "../lib/auth";
import { asyncHandler, ApiError } from "../lib/http";
import { parse, v, EMAIL_RE, PHONE_RE } from "../lib/validate";
import { authLimiter, otpLimiter } from "../middleware/rateLimit";
import { requireAuth, requireRealSession } from "../middleware/auth";
import { audit } from "../lib/audit";
import { pushNotification } from "../lib/services/notifications";

const router = express.Router();
router.use(authLimiter);

function publicUser(u: { id: string; username: string | null; email: string | null; phone: string | null; kycStatus: string; role: string }) {
  return { id: u.id, username: u.username, email: u.email, phone: u.phone, kycStatus: u.kycStatus, role: u.role };
}

async function issueSession(userId: string, req: express.Request) {
  const { token, tokenHash, expiresAt } = createSessionToken();
  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"].slice(0, 255) : null,
      ip: req.ip,
      deviceName: req.headers["x-device-name"]?.toString().slice(0, 80),
    },
  });
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  return token;
}

// ── Register ──────────────────────────────────────────────────────────
router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { username, email, password } = parse(
      { username: v.string({ min: 3, max: 30, lower: true }), email: v.string({ min: 5, max: 120, lower: true, pattern: EMAIL_RE }), password: v.string({ min: 8, max: 128 }) },
      req.body
    );

    const [existingUsername, existingEmail] = await Promise.all([
      prisma.user.findUnique({ where: { username } }),
      prisma.user.findUnique({ where: { email } }),
    ]);
    if (existingUsername) throw ApiError.badRequest("Username is already taken");
    if (existingEmail) throw ApiError.badRequest("Email is already registered");

    const deviceId = (typeof req.headers["x-device-id"] === "string" && req.headers["x-device-id"]) || `auth_${crypto.randomUUID()}`;
    const salt = generateSalt();
    const hashed = hashPasswordSecure(password, salt);

    // Reuse the anonymous device record if this browser already had one, so
    // any watchlist/holdings built up pre-signup carry over.
    let user = await prisma.user.findUnique({ where: { deviceId } });
    if (user) {
      user = await prisma.user.update({ where: { id: user.id }, data: { username, email, password: hashed, salt } });
    } else {
      user = await prisma.user.create({ data: { deviceId, username, email, password: hashed, salt } });
    }
    await prisma.userProfile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });

    const token = await issueSession(user.id, req);
    await audit(req, "auth.register", { userId: user.id });
    await pushNotification({ userId: user.id, category: "SECURITY", title: "Welcome to StockPulse", body: "Your account was created successfully." });

    return res.json({ success: true, token, deviceId: user.deviceId, user: publicUser(user) });
  })
);

// ── Login ─────────────────────────────────────────────────────────────
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { username, password, totp } = parse(
      { username: v.string({ min: 1, max: 120, lower: true }), password: v.string({ min: 1, max: 128 }), totp: v.optional(v.string({ min: 6, max: 6 })) },
      req.body
    );

    const user = await prisma.user.findFirst({ where: { OR: [{ username }, { email: username }] } });
    if (!user || !user.password || !user.salt) throw ApiError.badRequest("Invalid credentials");
    if (user.status !== "ACTIVE") throw ApiError.forbidden("This account is suspended");

    const { ok, needsUpgrade } = verifyPassword(password, user.salt, user.password);
    if (!ok) {
      await audit(req, "auth.login_failed", { userId: user.id });
      throw ApiError.badRequest("Invalid credentials");
    }

    if (user.twoFactorEnabled) {
      if (!totp) throw ApiError.badRequest("Two-factor code required", { requires2fa: true });
      if (!user.twoFactorSecret || !verifyTotp(user.twoFactorSecret, totp)) throw ApiError.badRequest("Invalid two-factor code");
    }

    if (needsUpgrade) {
      const upgraded = hashPasswordSecure(password, user.salt);
      await prisma.user.update({ where: { id: user.id }, data: { password: upgraded } });
    }

    const token = await issueSession(user.id, req);
    await audit(req, "auth.login", { userId: user.id });

    return res.json({ success: true, token, deviceId: user.deviceId, user: publicUser(user) });
  })
);

// ── OTP login/verification ───────────────────────────────────────────
router.post(
  "/otp/request",
  otpLimiter,
  asyncHandler(async (req, res) => {
    const { target, channel, purpose } = parse(
      { target: v.string({ min: 3, max: 120 }), channel: v.enumOf(["EMAIL", "SMS"] as const), purpose: v.withDefault(v.enumOf(["LOGIN", "VERIFY_EMAIL", "VERIFY_PHONE", "RESET_PASSWORD"] as const), "LOGIN") },
      req.body
    );
    if (channel === "EMAIL" && !EMAIL_RE.test(target)) throw ApiError.badRequest("Invalid email address");
    if (channel === "SMS" && !PHONE_RE.test(target)) throw ApiError.badRequest("Invalid phone number");

    const code = generateOtp();
    await prisma.otpCode.create({
      data: { target, channel, purpose, codeHash: hashOtp(code), expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });

    // No SMTP/SMS provider is wired up in this environment — logging the code
    // server-side keeps local development usable without fabricating delivery.
    console.log(`[otp] ${purpose} code for ${target} via ${channel}: ${code} (dev-mode, not actually sent)`);

    return res.json({ success: true, message: `A verification code was generated for ${target}.`, devHint: process.env.NODE_ENV !== "production" ? code : undefined });
  })
);

router.post(
  "/otp/verify",
  asyncHandler(async (req, res) => {
    const { target, code, purpose } = parse(
      { target: v.string({ min: 3, max: 120 }), code: v.string({ min: 4, max: 8 }), purpose: v.withDefault(v.enumOf(["LOGIN", "VERIFY_EMAIL", "VERIFY_PHONE", "RESET_PASSWORD"] as const), "LOGIN") },
      req.body
    );

    const otp = await prisma.otpCode.findFirst({
      where: { target, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!otp || otp.attempts >= 5) throw ApiError.badRequest("Code expired or invalid — request a new one");
    if (otp.codeHash !== hashOtp(code)) {
      await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw ApiError.badRequest("Incorrect code");
    }
    await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

    if (purpose === "LOGIN") {
      let user = await prisma.user.findFirst({ where: { OR: [{ email: target }, { phone: target }] } });
      if (!user) {
        user = await prisma.user.create({ data: { deviceId: `otp_${crypto.randomUUID()}`, email: target.includes("@") ? target : undefined, phone: !target.includes("@") ? target : undefined } });
        await prisma.userProfile.create({ data: { userId: user.id } });
      }
      const token = await issueSession(user.id, req);
      return res.json({ success: true, token, deviceId: user.deviceId, user: publicUser(user) });
    }

    if (purpose === "VERIFY_EMAIL" || purpose === "VERIFY_PHONE") {
      if (!req.user) throw ApiError.unauthorized("Sign in first to verify a contact method");
      await prisma.user.update({
        where: { id: req.user.id },
        data: purpose === "VERIFY_EMAIL" ? { emailVerified: true } : { phoneVerified: true },
      });
    }

    return res.json({ success: true, verified: true });
  })
);

// ── Forgot / reset password ─────────────────────────────────────────
router.post(
  "/forgot-password",
  otpLimiter,
  asyncHandler(async (req, res) => {
    const { email } = parse({ email: v.string({ min: 5, max: 120, lower: true, pattern: EMAIL_RE }) }, req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    // Always respond the same way to avoid confirming which emails are registered.
    if (user) {
      const code = generateOtp();
      await prisma.otpCode.create({
        data: { userId: user.id, target: email, channel: "EMAIL", purpose: "RESET_PASSWORD", codeHash: hashOtp(code), expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
      });
      console.log(`[otp] password reset code for ${email}: ${code} (dev-mode, not actually sent)`);
    }
    return res.json({ success: true, message: "If that email is registered, a reset code has been sent." });
  })
);

router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const { email, code, newPassword } = parse(
      { email: v.string({ min: 5, max: 120, lower: true, pattern: EMAIL_RE }), code: v.string({ min: 4, max: 8 }), newPassword: v.string({ min: 8, max: 128 }) },
      req.body
    );
    const otp = await prisma.otpCode.findFirst({
      where: { target: email, purpose: "RESET_PASSWORD", consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!otp || otp.codeHash !== hashOtp(code)) throw ApiError.badRequest("Invalid or expired reset code");

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw ApiError.badRequest("Invalid or expired reset code");

    const salt = generateSalt();
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { password: hashPasswordSecure(newPassword, salt), salt } }),
      prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } }),
      prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await audit(req, "auth.password_reset", { userId: user.id });
    await pushNotification({ userId: user.id, category: "SECURITY", priority: "HIGH", title: "Password changed", body: "Your password was reset. All other sessions were signed out." });

    return res.json({ success: true });
  })
);

// ── Sessions & device management ─────────────────────────────────────
router.get(
  "/sessions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const sessions = await prisma.session.findMany({
      where: { userId: req.user!.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
    });
    return res.json(sessions.map((s) => ({ id: s.id, deviceName: s.deviceName, userAgent: s.userAgent, ip: s.ip, lastSeenAt: s.lastSeenAt, createdAt: s.createdAt, current: s.id === req.sessionId })));
  })
);

router.delete(
  "/sessions/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.session.updateMany({ where: { id: req.params.id, userId: req.user!.id }, data: { revokedAt: new Date() } });
    return res.json({ success: true });
  })
);

router.post(
  "/logout-all",
  requireRealSession,
  asyncHandler(async (req, res) => {
    await prisma.session.updateMany({ where: { userId: req.user!.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(req, "auth.logout_all", { userId: req.user!.id });
    return res.json({ success: true });
  })
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    if (req.sessionId) await prisma.session.update({ where: { id: req.sessionId }, data: { revokedAt: new Date() } });
    return res.json({ success: true });
  })
);

// ── Two-factor authentication ────────────────────────────────────────
router.post(
  "/2fa/setup",
  requireRealSession,
  asyncHandler(async (req, res) => {
    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: req.user!.id }, data: { twoFactorSecret: secret, twoFactorEnabled: false } });
    const label = req.user!.email ?? req.user!.username ?? "StockPulse";
    const otpauth = `otpauth://totp/StockPulse:${encodeURIComponent(label)}?secret=${secret}&issuer=StockPulse`;
    return res.json({ secret, otpauth });
  })
);

router.post(
  "/2fa/enable",
  requireRealSession,
  asyncHandler(async (req, res) => {
    const { code } = parse({ code: v.string({ min: 6, max: 6 }) }, req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user?.twoFactorSecret || !verifyTotp(user.twoFactorSecret, code)) throw ApiError.badRequest("Invalid code");
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
    await pushNotification({ userId: user.id, category: "SECURITY", priority: "HIGH", title: "Two-factor authentication enabled", body: "2FA is now required at login." });
    return res.json({ success: true });
  })
);

router.post(
  "/2fa/disable",
  requireRealSession,
  asyncHandler(async (req, res) => {
    await prisma.user.update({ where: { id: req.user!.id }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
    return res.json({ success: true });
  })
);

export default router;
