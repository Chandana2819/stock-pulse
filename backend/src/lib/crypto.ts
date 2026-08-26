import crypto from "crypto";
import { env } from "../config/env";

/**
 * AES-256-GCM envelope encryption for secrets that must be stored but never
 * exposed — currently broker access tokens. Format: iv:tag:ciphertext (hex).
 */

function key(): Buffer {
  const raw = env.encryptionKey;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is not configured — refusing to store third-party tokens in plaintext.");
  }
  // Accept either a 64-char hex key or any passphrase (hashed to 32 bytes).
  return /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : crypto.createHash("sha256").update(raw).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), enc.toString("hex")].join(":");
}

export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Malformed encrypted payload");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

export function isEncryptionConfigured(): boolean {
  return Boolean(env.encryptionKey);
}
