import express from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { listBrokers, getBroker } from "../lib/providers";
import { encryptSecret, decryptSecret, isEncryptionConfigured } from "../lib/crypto";
import { asyncHandler, ApiError } from "../lib/http";
import { parse, v } from "../lib/validate";
import { requireAuth } from "../middleware/auth";
import { audit } from "../lib/audit";
import { env } from "../config/env";
import { syncUserBroker } from "../lib/services/brokerSync";

const router = express.Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [available, connections] = await Promise.all([listBrokers(), prisma.brokerConnection.findMany({ where: { userId: req.user!.id } })]);
    return res.json({
      available,
      connections: connections.map((c) => ({ broker: c.broker, status: c.status, connectedAt: c.connectedAt, lastSyncAt: c.lastSyncAt, lastError: c.lastError })),
    });
  })
);

router.get(
  "/:broker/connect",
  requireAuth,
  asyncHandler(async (req, res) => {
    const provider = getBroker(req.params.broker);
    if (!provider) throw ApiError.notFound("Unsupported broker");
    const referer = req.headers.referer;
    const origin = referer ? new URL(referer).origin : "http://localhost:3000";

    if (!provider.configured) {
      const state = crypto.randomBytes(16).toString("hex");
      return res.json({ authUrl: `${origin}/broker-login/${req.params.broker.toLowerCase()}?state=${req.user!.id}:${state}` });
    }

    const state = crypto.randomBytes(16).toString("hex");
    await prisma.brokerConnection.upsert({
      where: { userId_broker: { userId: req.user!.id, broker: provider.id } },
      update: { status: "DISCONNECTED", lastError: null },
      create: { userId: req.user!.id, broker: provider.id, status: "DISCONNECTED" },
    });

    const authUrl = provider.getAuthUrl(`${req.user!.id}:${state}`);
    return res.json({ authUrl });
  })
);

router.get(
  "/callback/:broker",
  requireAuth,
  asyncHandler(async (req, res) => {
    const provider = getBroker(req.params.broker);
    if (!provider) throw ApiError.notFound("Unsupported broker");
    
    const query = req.query as Record<string, unknown>;
    const rawToken = query.code || query.request_token;

    if (typeof rawToken !== "string" || !rawToken) {
      throw ApiError.badRequest("Missing code or request_token");
    }
    
    const userId = req.user!.id;

    // State validation (Upstox)
    if (provider.id === "UPSTOX") {
      const state = query.state;
      if (typeof state !== "string" || !state) {
        throw ApiError.badRequest("Missing state parameter");
      }
      const stateParts = state.split(":");
      if (stateParts[0] !== userId) {
        throw ApiError.badRequest("State validation failed: user ID mismatch");
      }
    }

    // Bypass encryption configuration check for the mock bypass code — dev/test only, never in production.
    const isMock = !env.isProd && rawToken === "mock_code_123";
    if (!isMock && !isEncryptionConfigured()) throw ApiError.unavailable("ENCRYPTION_KEY is not configured — cannot safely store a broker token.");

    let tokenResult;
    try {
      tokenResult = await provider.exchangeCode(rawToken);
    } catch (err: any) {
      if (provider.id === "ZERODHA") {
        throw err;
      } else if (provider.id === "UPSTOX") {
        const status = err.response?.status || 500;
        const data = err.response?.data;
        console.error(`[UPSTOX] Token exchange failed. Status: ${status}, Response:`, data || err.message);

        const upstoxErrorCode = data?.errors?.[0]?.errorCode || data?.error_code;
        const upstoxMessage = data?.errors?.[0]?.message || data?.error_description || err.message;

        let apiErrorCode = "UPSTOX_UNKNOWN_ERROR";
        if (upstoxErrorCode === "UDAPI100016" || upstoxErrorCode === "UDAPI100069") {
          apiErrorCode = "UPSTOX_INVALID_CLIENT";
        } else if (upstoxErrorCode === "UDAPI100068" || upstoxErrorCode === "UDAPI100070") {
          apiErrorCode = "UPSTOX_INVALID_REDIRECT_URI";
        } else if (upstoxErrorCode === "UDAPI100057") {
          apiErrorCode = "UPSTOX_INVALID_AUTHORIZATION_CODE";
        } else if (status === 403) {
          apiErrorCode = "UPSTOX_ACCOUNT_ERROR";
        } else if (status === 400) {
          apiErrorCode = "UPSTOX_AUTHENTICATION_ERROR";
        } else if (status >= 500) {
          apiErrorCode = "UPSTOX_PROVIDER_ERROR";
        }

        throw new ApiError(
          status >= 400 && status < 500 ? 400 : 502,
          `Upstox token exchange failed: ${upstoxMessage}`,
          apiErrorCode
        );
      } else {
        throw err;
      }
    }

    await prisma.brokerConnection.upsert({
      where: { userId_broker: { userId, broker: provider.id } },
      update: {
        status: "CONNECTED",
        accessTokenEnc: isMock ? tokenResult.accessToken : encryptSecret(tokenResult.accessToken),
        refreshTokenEnc: tokenResult.refreshToken ? (isMock ? tokenResult.refreshToken : encryptSecret(tokenResult.refreshToken)) : null,
        externalUserId: tokenResult.externalUserId,
        connectedAt: new Date(),
        expiresAt: tokenResult.expiresAt,
        lastError: null,
      },
      create: {
        userId,
        broker: provider.id,
        status: "CONNECTED",
        accessTokenEnc: isMock ? tokenResult.accessToken : encryptSecret(tokenResult.accessToken),
        refreshTokenEnc: tokenResult.refreshToken ? (isMock ? tokenResult.refreshToken : encryptSecret(tokenResult.refreshToken)) : null,
        externalUserId: tokenResult.externalUserId,
        connectedAt: new Date(),
        expiresAt: tokenResult.expiresAt,
      },
    });

    await audit(req, "broker.connected", { userId, meta: { broker: provider.id } });
    return res.json({ success: true, broker: provider.id });
  })
);

router.post(
  "/:broker/sync",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const result = await syncUserBroker(req.user!.id, req.params.broker);
      return res.json({
        holdings: result.holdings,
        orders: result.orders,
        syncedAt: new Date().toISOString()
      });
    } catch (err: any) {
      throw ApiError.unavailable(`Broker sync failed: ${err.message || err}`);
    }
  })
);

router.delete(
  "/:broker",
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.brokerConnection.deleteMany({ where: { userId: req.user!.id, broker: req.params.broker.toUpperCase() } });
    return res.json({ success: true });
  })
);

router.get(
  "/zerodha/login",
  requireAuth,
  asyncHandler(async (req, res) => {
    const provider = getBroker("ZERODHA");
    if (!provider) throw ApiError.notFound("Zerodha provider not found");
    const state = crypto.randomBytes(16).toString("hex");
    
    const referer = req.headers.referer;
    const origin = referer ? new URL(referer).origin : "http://localhost:3000";

    // Check if provider is configured
    if (!provider.configured) {
      return res.json({ authUrl: `${origin}/broker-login/zerodha?state=${req.user!.id}:${state}` });
    }
    
    return res.json({ authUrl: provider.getAuthUrl(`${req.user!.id}:${state}`) });
  })
);

router.get(
  "/zerodha/holdings",
  requireAuth,
  asyncHandler(async (req, res) => {
    const provider = getBroker("ZERODHA");
    if (!provider) throw ApiError.notFound("Zerodha provider not found");
    
    const conn = await prisma.brokerConnection.findUnique({
      where: { userId_broker: { userId: req.user!.id, broker: "ZERODHA" } }
    });
    if (!conn || conn.status !== "CONNECTED" || !conn.accessTokenEnc) {
      throw ApiError.badRequest("Zerodha is not connected");
    }
    
    const accessToken = conn.accessTokenEnc.startsWith("mock_") ? conn.accessTokenEnc : decryptSecret(conn.accessTokenEnc);
    const holdings = await provider.getHoldings(accessToken);
    return res.json({ holdings });
  })
);

router.get(
  "/zerodha/positions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const provider = getBroker("ZERODHA");
    if (!provider) throw ApiError.notFound("Zerodha provider not found");
    if (!provider.getPositions) throw ApiError.badRequest("Positions API not supported for Zerodha");
    
    const conn = await prisma.brokerConnection.findUnique({
      where: { userId_broker: { userId: req.user!.id, broker: "ZERODHA" } }
    });
    if (!conn || conn.status !== "CONNECTED" || !conn.accessTokenEnc) {
      throw ApiError.badRequest("Zerodha is not connected");
    }
    
    const accessToken = conn.accessTokenEnc.startsWith("mock_") ? conn.accessTokenEnc : decryptSecret(conn.accessTokenEnc);
    const positions = await provider.getPositions(accessToken);
    return res.json({ positions });
  })
);

export default router;
