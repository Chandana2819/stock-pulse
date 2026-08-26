// Central, typed access to configuration. Nothing else in the backend reads
// process.env directly, so missing/incorrect config surfaces in one place and
// secrets never leak into responses.
import "dotenv/config";

function str(key: string, fallback = ""): string {
  const v = process.env[key];
  return v == null || v === "" ? fallback : v;
}

function num(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) ? v : fallback;
}

function bool(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (v == null) return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

const nodeEnv = str("NODE_ENV", "development");

export const env = {
  nodeEnv,
  isProd: nodeEnv === "production",
  port: num("PORT", 5000),
  databaseUrl: str("DATABASE_URL", "file:./prisma/dev.db"),

  /** Signing key for session tokens. Auto-generated in dev; REQUIRED in prod. */
  sessionSecret: str("SESSION_SECRET", ""),
  sessionTtlDays: num("SESSION_TTL_DAYS", 30),

  /** Key used to encrypt broker tokens at rest (AES-256-GCM). */
  encryptionKey: str("ENCRYPTION_KEY", ""),

  corsOrigins: str("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // Optional integrations. Every one of these is feature-detected at runtime:
  // when the key is absent the related module reports itself as unconfigured
  // instead of returning fabricated data.
  openAiKey: str("OPENAI_API_KEY", ""),
  openAiModel: str("OPENAI_MODEL", "gpt-4o-mini"),
  anthropicKey: str("ANTHROPIC_API_KEY", ""),
  anthropicModel: str("ANTHROPIC_MODEL", "claude-sonnet-5"),

  newsApiKey: str("NEWS_API_KEY", ""),

  razorpayKeyId: str("RAZORPAY_KEY_ID", ""),
  razorpayKeySecret: str("RAZORPAY_KEY_SECRET", ""),
  razorpayWebhookSecret: str("RAZORPAY_WEBHOOK_SECRET", ""),

  smtpUrl: str("SMTP_URL", ""),
  smsProviderKey: str("SMS_PROVIDER_KEY", ""),

  redisUrl: str("REDIS_URL", ""),

  brokerRedirectBase: str("BROKER_REDIRECT_BASE", "https://stock-pulse-vzuy.onrender.com/api/brokers/callback"),

  enableJobs: bool("ENABLE_BACKGROUND_JOBS", true),
  alertIntervalMs: num("ALERT_INTERVAL_MS", 120_000),

  adminEmails: str("ADMIN_EMAILS", "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
};

/** Fails fast in production if a security-critical secret is missing. */
export function assertProductionConfig() {
  if (!env.isProd) return;
  const missing: string[] = [];
  if (!env.sessionSecret) missing.push("SESSION_SECRET");
  if (!env.encryptionKey) missing.push("ENCRYPTION_KEY");
  if (missing.length) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }
}
