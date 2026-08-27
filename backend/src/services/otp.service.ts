import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/http";

export function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export class OtpService {
  /** Generates a cryptographically secure 6-digit OTP code and records its hash in the database. */
  public static async generateOTP(
    target: string,
    purpose: string,
    channel: "EMAIL" | "SMS",
    userId?: string
  ): Promise<string> {
    const cleanTarget = target.trim().toLowerCase();

    // 1-minute resend cooldown check
    const lastOtp = await prisma.otpCode.findFirst({
      where: { target: cleanTarget, purpose, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    
    if (lastOtp && Date.now() - lastOtp.createdAt.getTime() < 60000) {
      throw ApiError.badRequest("Please wait 1 minute before requesting another verification code.");
    }

    // Generate secure 6-digit number
    const otp = crypto.randomInt(100000, 999999).toString();
    const codeHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes lifetime

    await prisma.otpCode.create({
      data: {
        userId,
        target: cleanTarget,
        channel,
        purpose,
        codeHash,
        expiresAt,
      },
    });

    return otp;
  }

  /** Verifies OTP, checks max attempts, validity duration, and sets consumed time on success. */
  public static async verifyOTP(target: string, purpose: string, code: string): Promise<boolean> {
    const cleanTarget = target.trim().toLowerCase();

    const otpRecord = await prisma.otpCode.findFirst({
      where: { target: cleanTarget, purpose, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (!otpRecord) {
      throw ApiError.badRequest("No verification code found or code has already been used.");
    }

    // Expiry check
    if (otpRecord.expiresAt < new Date()) {
      throw ApiError.badRequest("Verification code has expired. Please request a new one.");
    }

    // Max attempts check (5 attempts limit)
    if (otpRecord.attempts >= 5) {
      throw ApiError.badRequest("Verification code blocked due to too many failed attempts. Please request a new code.");
    }

    const inputHash = hashOtp(code.trim());
    if (otpRecord.codeHash !== inputHash) {
      // Increment attempts safely
      await prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });
      throw ApiError.badRequest("Invalid verification code.");
    }

    // Success: Invalidate OTP (mark consumed) to prevent reuse
    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { consumedAt: new Date() },
    });

    return true;
  }
}
