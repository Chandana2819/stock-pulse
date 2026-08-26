import crypto from "crypto";
import { env } from "../config/env";

/** Generates a cryptographically secure 16-byte random salt. */
export function generateSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Legacy PBKDF2 hash (1,000 iterations) used by accounts created before the
 * scrypt migration. Kept only so existing users can still log in — every
 * successful legacy login is transparently re-hashed with scrypt.
 */
export function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
}

const SCRYPT_PREFIX = "scrypt$";

/** Current password hashing: scrypt with per-user salt, encoded with its scheme. */
export function hashPasswordSecure(password: string, salt: string): string {
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `${SCRYPT_PREFIX}${derived}`;
}

/** Constant-time verification that understands both the legacy and current schemes. */
export function verifyPassword(password: string, salt: string, stored: string): { ok: boolean; needsUpgrade: boolean } {
  if (stored.startsWith(SCRYPT_PREFIX)) {
    const candidate = hashPasswordSecure(password, salt);
    return { ok: timingSafeEqual(candidate, stored), needsUpgrade: false };
  }
  const legacy = hashPassword(password, salt);
  return { ok: timingSafeEqual(legacy, stored), needsUpgrade: true };
}

export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ── Session tokens ────────────────────────────────────────────────────
// Opaque random tokens, stored only as a hash. An attacker with database read
// access still cannot mint a usable session, and revocation is a row update.

let cachedSecret: string | null = null;
function secret(): string {
  if (cachedSecret) return cachedSecret;
  if (env.sessionSecret) {
    cachedSecret = env.sessionSecret;
  } else {
    // Dev convenience only — assertProductionConfig() refuses to boot without a
    // real SESSION_SECRET in production. A regenerated dev secret simply
    // invalidates local sessions on restart.
    cachedSecret = crypto.randomBytes(32).toString("hex");
    console.warn("[auth] SESSION_SECRET is not set — generated an ephemeral development secret.");
  }
  return cachedSecret;
}

export function createSessionToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.sessionTtlDays * 24 * 60 * 60 * 1000);
  return { token, tokenHash: hashToken(token), expiresAt };
}

export function hashToken(token: string): string {
  return crypto.createHmac("sha256", secret()).update(token).digest("hex");
}

// ── One-time codes ────────────────────────────────────────────────────

export function generateOtp(digits = 6): string {
  const max = 10 ** digits;
  return String(crypto.randomInt(0, max)).padStart(digits, "0");
}

export function hashOtp(code: string): string {
  return crypto.createHmac("sha256", secret()).update(code).digest("hex");
}

// ── TOTP (2FA) ────────────────────────────────────────────────────────

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(length = 20): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += BASE32[bytes[i] % 32];
  return out;
}

function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of input.replace(/=+$/, "").toUpperCase()) {
    const idx = BASE32.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 6238 TOTP, 30-second step, 6 digits — compatible with any authenticator app. */
export function totpCode(secretBase32: string, at: number = Date.now()): string {
  const counter = Math.floor(at / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac("sha1", base32Decode(secretBase32)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

/** Accepts the current step plus one step either side, to tolerate clock drift. */
export function verifyTotp(secretBase32: string, code: string): boolean {
  const now = Date.now();
  for (const drift of [-1, 0, 1]) {
    if (timingSafeEqual(totpCode(secretBase32, now + drift * 30_000), code)) return true;
  }
  return false;
}
