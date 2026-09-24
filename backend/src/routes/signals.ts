import express from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, ApiError } from "../lib/http";
import { runMarketScan } from "../lib/services/scanner";
import { runBacktest } from "../lib/services/backtest";
import { UNIVERSE, lookupUniverse, type UniverseEntry } from "../lib/universe";
import { getEnrichedHoldings } from "../lib/services/portfolio";
import { syncUserBroker } from "../lib/services/brokerSync";
import { buildStockAnalysis } from "../lib/services/stockAnalysis";
import { getBacktestedTrackRecord, getLiveTrackRecord } from "../lib/services/trackRecord";

const router = express.Router();

// Helper to compile signals payload
async function getSignalsPayload(userId?: string, queryFilters: any = {}) {
  const actionFilter = queryFilters.action ? String(queryFilters.action).toUpperCase() : null;
  const sectorFilter = queryFilters.sector ? String(queryFilters.sector) : null;
  const exchangeFilter = queryFilters.exchange ? String(queryFilters.exchange).toUpperCase() : null;
  const sortBy = queryFilters.sortBy ? String(queryFilters.sortBy) : "score"; // score | confidence | risk | symbol

  // Fetch all recommendations — DB may be unavailable (e.g. Supabase paused on free tier)
  let recommendations: any[] = [];
  try {
    recommendations = await prisma.stockRecommendation.findMany();
  } catch {
    // DB unreachable — serve empty scan results so homepage doesn't crash
  }

  // Map display metadata from universe
  const universeMap = new Map<string, UniverseEntry>(UNIVERSE.map((u: UniverseEntry) => [u.symbol, u]));
  
  let items = recommendations.map((rec: any) => {
    const u = universeMap.get(rec.symbol);
    return {
      id: rec.id,
      symbol: rec.symbol,
      displaySymbol: u?.display ?? rec.symbol.replace(".NS", ""),
      name: u?.name ?? null,
      sector: u?.sector ?? "Other",
      sectorKey: u?.sectorKey ?? "OTHER",
      exchange: u?.exchange ?? "NSE",
      action: rec.action,
      score: rec.score,
      confidence: rec.confidence,
      risk: rec.risk,
      reasons: JSON.parse(rec.reasons),
      warnings: JSON.parse(rec.warnings),
      entryZone: rec.entryZoneMin && rec.entryZoneMax ? { min: rec.entryZoneMin, max: rec.entryZoneMax } : null,
      stopLoss: rec.stopLoss,
      targetRange: rec.targetRangeMin && rec.targetRangeMax ? { min: rec.targetRangeMin, max: rec.targetRangeMax } : null,
      dataQuality: rec.dataQuality,
      generatedAt: rec.generatedAt,
    };
  });

  // Detect broker connection status and compute portfolio signals
  let brokerConnection = { connected: false, broker: null as string | null, expired: false, everConnected: false, lastSyncAt: null as Date | null, lastError: null as string | null };
  let portfolioSignals: any[] = [];

  if (userId) {
    let conn = null;
    try {
      conn = await prisma.brokerConnection.findUnique({
        where: { userId_broker: { userId, broker: "ZERODHA" } }
      });
    } catch {
      // DB unreachable
    }
    if (conn) {
      const isExpired = conn.expiresAt ? conn.expiresAt < new Date() : false;
      brokerConnection = {
        connected: conn.status === "CONNECTED" && !isExpired,
        broker: conn.broker,
        expired: isExpired,
        everConnected: conn.connectedAt != null,
        lastSyncAt: conn.lastSyncAt,
        lastError: conn.lastError
      };
    }

    let enrichedHoldings: any[] = [];
    try { enrichedHoldings = await getEnrichedHoldings(userId); } catch {}
    if (enrichedHoldings.length > 0) {
      // Bounded-concurrency batching, matching the pattern already used for
      // this same per-holding analysis in routes/portfolio.ts: running every
      // holding's analysis (quote + 5Y candles + fundamentals + news) at
      // once would fan out N simultaneous calls to the same market-data/news
      // providers for a large portfolio, risking their rate limits.
      const ANALYSIS_BATCH_SIZE = 6;
      portfolioSignals = [];
      for (let i = 0; i < enrichedHoldings.length; i += ANALYSIS_BATCH_SIZE) {
        const batch = enrichedHoldings.slice(i, i + ANALYSIS_BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(async (h) => {
          let symbol = h.stock.toUpperCase().trim();
          if (h.exchange === "NSE" && !symbol.endsWith(".NS")) {
            symbol = `${symbol}.NS`;
          } else if (h.exchange === "BSE" && !symbol.endsWith(".BO")) {
            symbol = `${symbol}.BO`;
          }

          const analysis = await buildStockAnalysis(symbol).catch(() => null);
          const uItem = lookupUniverse(symbol);

          if (analysis && analysis.found) {
            const d = analysis.decision;
            return {
              id: `portfolio-${symbol}`,
              symbol,
              displaySymbol: h.displaySym,
              name: h.displaySym,
              sector: uItem?.sector || "Other",
              sectorKey: uItem?.sectorKey || "OTHER",
              exchange: h.exchange,
              action: d.signal,
              score: d.scores.final,
              confidence: d.confidence,
              risk: d.riskLevel,
              reasons: d.reasons,
              warnings: d.warnings,
              synthesis: d.synthesis,
              mainRisk: d.mainRisk,
              wouldChange: d.wouldChange,
              pillars: d.pillars,
              entryZone: d.entryZone,
              stopLoss: d.stopLoss,
              targetRange: d.targetRange,
              dataQuality: d.dataQuality,
              horizon: d.horizon,
              activeSince: d.activeSince,
              quantity: h.quantity,
              avgPrice: h.avgPrice,
              currentPrice: h.currentPrice,
              unrealizedPnl: h.pl,
              investedValue: h.cost,
              currentValue: h.value,
            };
          }

          return {
            id: `portfolio-${symbol}`,
            symbol,
            displaySymbol: h.displaySym,
            name: h.displaySym,
            sector: uItem?.sector || "Other",
            sectorKey: uItem?.sectorKey || "OTHER",
            exchange: h.exchange,
            action: "WAIT",
            score: 50,
            confidence: 30,
            risk: "MODERATE",
            reasons: ["Market data currently unavailable for portfolio evaluation"],
            warnings: ["Insufficient live data"],
            entryZone: null,
            stopLoss: null,
            targetRange: null,
            dataQuality: "INSUFFICIENT",
            quantity: h.quantity,
            avgPrice: h.avgPrice,
            currentPrice: h.currentPrice,
            unrealizedPnl: h.pl,
            investedValue: h.cost,
            currentValue: h.value,
          };
        }));
        portfolioSignals.push(...batchResults);
      }
    }
  }

  // Portfolio-based SELL/REDUCE/HOLD data is only usable when the user is
  // logged in AND actually holds something; otherwise every count/filter
  // below must consistently fall back to the market-scan table, or the
  // summary tiles and the item list disagree about what's on screen.
  const usePortfolioForSellHold = Boolean(userId) && portfolioSignals.length > 0;

  // Apply filters - SELL/REDUCE and HOLD fetch from portfolio when the user has holdings
  if (actionFilter) {
    if (actionFilter === "BUY") {
      items = items.filter((item: any) => item.action.includes("BUY"));
    } else if (actionFilter === "SELL" || actionFilter === "REDUCE") {
      items = usePortfolioForSellHold
        ? portfolioSignals.filter((item: any) => item.action.includes("SELL") || item.action === "REDUCE")
        : items.filter((item: any) => item.action.includes("SELL") || item.action === "REDUCE");
    } else if (actionFilter === "HOLD") {
      items = usePortfolioForSellHold
        ? portfolioSignals.filter((item: any) => item.action === "HOLD")
        : items.filter((item: any) => item.action === "HOLD");
    } else {
      items = items.filter((item: any) => item.action === actionFilter);
    }
  }

  if (sectorFilter) {
    items = items.filter((item: any) => item.sectorKey === sectorFilter || item.sector === sectorFilter);
  }

  if (exchangeFilter) {
    items = items.filter((item: any) => item.exchange === exchangeFilter);
  }

  // Apply sorting
  if (sortBy === "confidence") {
    items.sort((a: any, b: any) => b.confidence - a.confidence);
  } else if (sortBy === "symbol") {
    items.sort((a: any, b: any) => a.displaySymbol.localeCompare(b.displaySymbol));
  } else if (sortBy === "risk") {
    const riskMap: Record<string, number> = { LOW: 1, MODERATE: 2, HIGH: 3, "VERY HIGH": 4 };
    items.sort((a: any, b: any) => riskMap[b.risk] - riskMap[a.risk]);
  } else {
    items.sort((a: any, b: any) => b.score - a.score);
  }

  // Calculate signals overview counts: SELL and HOLD fetch from portfolio
  // under the exact same condition used to build `items` above, so the
  // summary tiles never disagree with what the list actually shows.
  const buyCount = recommendations.filter((r: any) => r.action.includes("BUY")).length;
  const waitCount = recommendations.filter((r: any) => r.action === "WAIT").length;

  const sellCount = usePortfolioForSellHold
    ? portfolioSignals.filter((r: any) => r.action.includes("SELL") || r.action === "REDUCE").length
    : recommendations.filter((r: any) => r.action.includes("SELL") || r.action === "REDUCE").length;
  const holdCount = usePortfolioForSellHold
    ? portfolioSignals.filter((r: any) => r.action === "HOLD").length
    : recommendations.filter((r: any) => r.action === "HOLD").length;

  let latestRisk = null;
  try { latestRisk = await prisma.marketRisk.findFirst({ orderBy: { createdAt: "desc" } }); } catch {}
  const scanTime = latestRisk ? latestRisk.createdAt : new Date();

  return {
    summary: {
      total: recommendations.length,
      buy: buyCount,
      sell: sellCount,
      hold: holdCount,
      wait: waitCount,
    },
    items,
    brokerConnection,
    portfolioSignals,
    scanTime,
  };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const payload = await getSignalsPayload(req.user?.id, req.query);
    return res.json(payload);
  })
);

router.get(
  "/market-risk",
  asyncHandler(async (_req, res) => {
    let risk = null;
    try {
      risk = await prisma.marketRisk.findFirst({
        orderBy: { createdAt: "desc" },
      });
    } catch {
      // DB unreachable — fall through to the neutral baseline below
    }
    if (!risk) {
      return res.json({
        score: 50,
        classification: "MODERATE RISK",
        statusEmoji: "🟡",
        factors: [],
        reasons: ["Scanning pending; serving neutral market baseline"],
      });
    }
    return res.json({
      score: risk.score,
      classification: risk.level + " RISK",
      ...JSON.parse(risk.details),
      createdAt: risk.createdAt,
    });
  })
);

router.get(
  "/history",
  asyncHandler(async (req, res) => {
    const symbol = String(req.query.symbol ?? "").trim();
    if (!symbol) throw ApiError.badRequest("Query parameter 'symbol' is required.");

    const history = await prisma.recommendationHistory.findMany({
      where: { symbol },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    const items = history.map((h: any) => ({
      id: h.id,
      symbol: h.symbol,
      action: h.action,
      score: h.score,
      confidence: h.confidence,
      risk: h.risk,
      reasons: JSON.parse(h.reasons),
      generatedAt: h.generatedAt,
      createdAt: h.createdAt,
    }));

    return res.json({ symbol, history: items });
  })
);

router.post(
  "/backtest",
  asyncHandler(async (req, res) => {
    const symbols = req.body.symbols && Array.isArray(req.body.symbols) 
      ? req.body.symbols 
      : ["TCS.NS", "INFY.NS", "RELIANCE.NS", "SBIN.NS", "HDFCBANK.NS"];
      
    const startDate = req.body.startDate ? new Date(req.body.startDate) : new Date(Date.now() - 180 * 24 * 3600 * 1000); // default 180d
    const endDate = req.body.endDate ? new Date(req.body.endDate) : new Date();

    const results = await runBacktest({
      symbols,
      startDate,
      endDate,
    });

    return res.json(results);
  })
);

router.get(
  "/track-record",
  asyncHandler(async (_req, res) => {
    try {
      const [backtested, live] = await Promise.all([getBacktestedTrackRecord(), getLiveTrackRecord()]);
      return res.json({
        backtested: backtested.value,
        live: live.value,
        meta: {
          backtestedCacheHit: backtested.cacheHit,
          backtestedStale: backtested.stale,
          liveCacheHit: live.cacheHit,
          liveStale: live.stale,
        },
      });
    } catch {
      // DB unavailable or backtest failed — return empty track record
      return res.json({
        backtested: null,
        live: null,
        meta: { dbUnavailable: true },
      });
    }
  })
);

router.post(
  "/scan",
  asyncHandler(async (req, res) => {
    // 1. Sync connected user broker if active
  if (req.user) {
      const conn = await prisma.brokerConnection.findUnique({
        where: { userId_broker: { userId: req.user.id, broker: "ZERODHA" } }
      });
      if (conn && conn.status === "CONNECTED") {
        try {
          await syncUserBroker(req.user.id, conn.broker);
          console.log(`[scan] Successfully synced broker ${conn.broker} for user ${req.user.id}`);
        } catch (err) {
          console.error(`[scan] Broker sync failed during scanning:`, err);
        }
      }
    }

    // 2. Wait for full market scan to run live
    await runMarketScan();

    // 3. Return the full compiled payload so frontend receives fresh data directly
    const payload = await getSignalsPayload(req.user?.id, req.body.queryFilters || {});
    return res.json({
      success: true,
      message: "Market scan and broker sync completed successfully.",
      ...payload
    });
  })
);

export default router;
