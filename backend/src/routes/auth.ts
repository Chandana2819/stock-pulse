import express from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { generateSalt, hashPasswordSecure, verifyPassword, createSessionToken, generateTotpSecret, verifyTotp } from "../lib/auth";
import { asyncHandler, ApiError } from "../lib/http";
import { parse, v, EMAIL_RE, PHONE_RE } from "../lib/validate";
import { authLimiter, otpLimiter } from "../middleware/rateLimit";
import { requireAuth, requireRealSession } from "../middleware/auth";
import { audit } from "../lib/audit";
import { pushNotification } from "../lib/services/notifications";
import { env } from "../config/env";
import { EmailService } from "../services/email.service";
import { OtpService } from "../services/otp.service";

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
    const isOwnerOrAdmin = env.adminEmails.includes(email.toLowerCase());
    const role = isOwnerOrAdmin ? "ADMIN" : "USER";

    let user = await prisma.user.findUnique({ where: { deviceId } });
    if (user) {
      user = await prisma.user.update({ where: { id: user.id }, data: { username, email, password: hashed, salt, role } });
    } else {
      user = await prisma.user.create({ data: { deviceId, username, email, password: hashed, salt, role } });
    }
    await prisma.userProfile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });

    const token = await issueSession(user.id, req);
    await audit(req, "auth.register", { userId: user.id });
    await pushNotification({ userId: user.id, category: "SECURITY", title: "Welcome to StockPulse", body: "Your account was created successfully." });

    // Generate email verification OTP and welcome messages on registration
    try {
      const code = await OtpService.generateOTP(email, "VERIFY_EMAIL", "EMAIL", user.id);
      await EmailService.sendEmailVerificationOTP(email, code);
      await EmailService.sendWelcomeEmail(email, username);
      
      // If Brevo key is absent, print verification code in terminal for developer fallback
      if (!process.env.BREVO_API_KEY) {
        console.log(`[otp] VERIFY_EMAIL code for ${email}: ${code} (dev-mode, not actually sent)`);
      }
    } catch (e) {
      console.error("[Register OTP Error]", e);
    }

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

    const code = await OtpService.generateOTP(target, purpose, channel, req.user?.id);

    // Send email via Brevo if channel is EMAIL
    if (channel === "EMAIL") {
      if (purpose === "RESET_PASSWORD") {
        await EmailService.sendPasswordResetOTP(target, code);
      } else {
        await EmailService.sendEmailVerificationOTP(target, code);
      }
    }

    // Dev mode fallback logging
    if (!process.env.BREVO_API_KEY) {
      console.log(`[otp] ${purpose} code for ${target} via ${channel}: ${code} (dev-mode, not actually sent)`);
    }

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

    await OtpService.verifyOTP(target, purpose, code);

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
    
    if (user) {
      try {
        const code = await OtpService.generateOTP(email, "RESET_PASSWORD", "EMAIL", user.id);
        await EmailService.sendPasswordResetOTP(email, code);

        // Dev mode fallback logging
        if (!process.env.BREVO_API_KEY) {
          console.log(`[otp] RESET_PASSWORD code for ${email}: ${code} (dev-mode, not actually sent)`);
        }
      } catch (err) {
        // Safe console-only logging
        console.error("[ForgotPassword Error]", err);
      }
    }
    
    return res.json({ message: "If an account exists for this email, a verification code has been sent." });
  })
);

router.post(
  "/verify-reset-otp",
  otpLimiter,
  asyncHandler(async (req, res) => {
    const { email, otp } = parse({
      email: v.string({ min: 5, max: 120, lower: true, pattern: EMAIL_RE }),
      otp: v.string({ min: 6, max: 6 })
    }, req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw ApiError.badRequest("Invalid or expired reset code");
    }

    // Verify OTP
    await OtpService.verifyOTP(email, "RESET_PASSWORD", otp);

    // Issue secure short-lived reset authorization token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes validity

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      }
    });

    return res.json({ resetToken });
  })
);

router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const { resetToken, newPassword } = parse({
      resetToken: v.string({ min: 10 }),
      newPassword: v.string({ min: 8, max: 128 })
    }, req.body);

    const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    const tokenRecord = await prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true }
    });

    if (!tokenRecord || !tokenRecord.user) {
      throw ApiError.badRequest("Invalid or expired reset token");
    }

    const user = tokenRecord.user;
    const salt = generateSalt();

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { password: hashPasswordSecure(newPassword, salt), salt } }),
      prisma.passwordResetToken.update({ where: { id: tokenRecord.id }, data: { usedAt: new Date() } }),
      prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);

    await audit(req, "auth.password_reset", { userId: user.id });
    await pushNotification({ userId: user.id, category: "SECURITY", priority: "HIGH", title: "Password changed", body: "Your password was reset. All other sessions were signed out." });
    
    // Security alert email
    await EmailService.sendSecurityAlert(user.email || "", "Password Changed", "Your StockPulse password was successfully updated recently.");

    return res.json({ success: true });
  })
);

router.post(
  "/verify-email",
  asyncHandler(async (req, res) => {
    const { email, otp } = parse({
      email: v.string({ min: 5, max: 120, lower: true, pattern: EMAIL_RE }),
      otp: v.string({ min: 6, max: 6 })
    }, req.body);

    await OtpService.verifyOTP(email, "VERIFY_EMAIL", otp);

    await prisma.user.update({
      where: { email },
      data: { emailVerified: true },
    });

    return res.json({ success: true, verified: true });
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
