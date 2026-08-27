import express from "express";
import cors from "cors";
import { env, assertProductionConfig } from "./config/env";
import { attachUser } from "./middleware/auth";
import { globalLimiter } from "./middleware/rateLimit";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { startBackgroundJobs } from "./jobs/scheduler";

import authRouter from "./routes/auth";
import userRouter from "./routes/user";
import watchlistRouter from "./routes/watchlist";
import portfolioRouter from "./routes/portfolio";
import transactionsRouter from "./routes/transactions";
import journalRouter from "./routes/journal";
import stocksRouter from "./routes/stocks";
import marketRouter from "./routes/market";
import screenerRouter from "./routes/screener";
import goalsRouter from "./routes/goals";
import alertsRouter from "./routes/alerts";
import notificationsRouter from "./routes/notifications";
import mutualFundsRouter from "./routes/mutualfunds";
import ipoRouter from "./routes/ipo";
import learningRouter from "./routes/learning";
import aiRouter from "./routes/ai";
import calculatorsRouter from "./routes/calculators";
import eventsRouter from "./routes/events";
import paymentsRouter from "./routes/payments";
import brokersRouter from "./routes/brokers";
import taxRouter from "./routes/tax";
import supportRouter from "./routes/support";
import adminRouter from "./routes/admin";
import searchRouter from "./routes/search";
import legacyAnalyzeRouter from "./routes/legacyAnalyze";
import communityRouter from "./routes/community";
import kycRouter from "./routes/kyc";
import signalsRouter from "./routes/signals";

assertProductionConfig();

const app = express();
const PORT = env.port;

app.set("trust proxy", 1);

app.use(cors({
  origin: (origin, callback) => {
    if (!env.isProd) {
      callback(null, true);
    } else if (!origin || env.corsOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true
}));
app.use(express.json({ limit: "1mb" }));

// ─── Security headers ───
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
  if (env.isProd) res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  next();
});

app.use(globalLimiter);
app.use(attachUser);

// ─── Routes ───
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/watchlist", watchlistRouter);
app.use("/api/portfolio", portfolioRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/journal", journalRouter);
app.use("/api/stocks", stocksRouter);
app.use("/api/market", marketRouter);
app.use("/api/screener", screenerRouter);
app.use("/api/goals", goalsRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/mutual-funds", mutualFundsRouter);
app.use("/api/ipo", ipoRouter);
app.use("/api/learning", learningRouter);
app.use("/api/ai", aiRouter);
app.use("/api/calculators", calculatorsRouter);
app.use("/api/events", eventsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/brokers", brokersRouter);
app.use("/api/tax", taxRouter);
app.use("/api/support", supportRouter);
app.use("/api/admin", adminRouter);
app.use("/api/search", searchRouter);
app.use("/api/community", communityRouter);
app.use("/api/kyc", kycRouter);
app.use("/api/signals", signalsRouter);

// Legacy endpoints kept for the existing frontend build (/api/analyze, /api/market
// already covered above) — new frontend code should prefer /api/stocks/:symbol.
app.use("/api", legacyAnalyzeRouter);

app.get("/api/health", (_req, res) => res.json({
  status: "ok",
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
  env: {
    ZERODHA_API_KEY: process.env.ZERODHA_API_KEY ? "present" : "missing",
    ZERODHA_API_SECRET: process.env.ZERODHA_API_SECRET ? "present" : "missing",
    ZERODHA_REDIRECT_URL: process.env.ZERODHA_REDIRECT_URL ? "present" : "missing",
  }
}));

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[StockPulse Backend] Server running on http://localhost:${PORT}`);
  startBackgroundJobs();
});
