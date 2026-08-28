import express from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, ApiError } from "../lib/http";
import { runMarketScan, backfillStock } from "../lib/services/scanner";
import { runBacktest } from "../lib/services/backtest";
import { UNIVERSE, lookupUniverse, type UniverseEntry } from "../lib/universe";
import { getEnrichedHoldings } from "../lib/services/portfolio";
import { marketDataProvider, newsProvider } from "../lib/providers";
import { getSectorChangeForKey } from "../lib/services/market";
import { computeIndicators } from "../lib/indicators";
import { RecommendationEngine } from "../lib/services/recommendationEngine";
import { syncUserBroker } from "../lib/services/brokerSync";

const router = express.Router();

// Helper to compile signals payload
async function getSignalsPayload(userId?: string, queryFilters: any = {}) {
  const actionFilter = queryFilters.action ? String(queryFilters.action).toUpperCase() : null;
  const sectorFilter = queryFilters.sector ? String(queryFilters.sector) : null;
  const exchangeFilter = queryFilters.exchange ? String(queryFilters.exchange).toUpperCase() : null;
  const sortBy = queryFilters.sortBy ? String(queryFilters.sortBy) : "score"; // score | confidence | risk | symbol

  // Fetch all recommendations
  const recommendations = await prisma.stockRecommendation.findMany();

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

  // Apply filters
  if (actionFilter) {
    if (actionFilter === "BUY") {
      items = items.filter((item: any) => item.action.includes("BUY"));
    } else if (actionFilter === "SELL" || actionFilter === "REDUCE") {
      items = items.filter((item: any) => item.action.includes("SELL") || item.action === "REDUCE");
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

  // Detect broker connection status
  let brokerConnection = { connected: false, broker: null as string | null, expired: false, lastSyncAt: null as Date | null, lastError: null as string | null };
  let portfolioSignals: any[] = [];

  if (userId) {
    const conn = await prisma.brokerConnection.findUnique({
      where: { userId_broker: { userId, broker: "ZERODHA" } }
    });
    if (conn) {
      const isExpired = conn.expiresAt ? conn.expiresAt < new Date() : false;
      brokerConnection = {
        connected: conn.status === "CONNECTED" && !isExpired,
        broker: conn.broker,
        expired: isExpired,
        lastSyncAt: conn.lastSyncAt,
        lastError: conn.lastError
      };

      if (brokerConnection.connected) {
        const enrichedHoldings = await getEnrichedHoldings(userId);
        const recsMap = new Map<string, any>(recommendations.map(r => [r.symbol.toUpperCase().trim(), r]));

        for (const h of enrichedHoldings) {
          let symbol = h.stock.toUpperCase().trim();
          if (h.exchange === "NSE" && !symbol.endsWith(".NS")) {
            symbol = `${symbol}.NS`;
          } else if (h.exchange === "BSE" && !symbol.endsWith(".BO")) {
            symbol = `${symbol}.BO`;
          }
          let rec = recsMap.get(symbol);

          if (!rec) {
            // Generate dynamically if not in local universe
            try {
              let prices = await prisma.stockPrice.findMany({
                where: { symbol },
                orderBy: { date: "asc" },
              });

              let candles = prices.map((p) => ({
                time: Math.floor(p.date.getTime() / 1000),
                open: p.open,
                high: p.high,
                low: p.low,
                close: p.close,
                volume: p.volume,
              }));

              if (candles.length < 30) {
                const ok = await backfillStock(symbol);
                if (ok) {
                  const freshPrices = await prisma.stockPrice.findMany({
                    where: { symbol },
                    orderBy: { date: "asc" },
                  });
                  candles = freshPrices.map((p) => ({
                    time: Math.floor(p.date.getTime() / 1000),
                    open: p.open,
                    high: p.high,
                    low: p.low,
                    close: p.close,
                    volume: p.volume,
                  }));
                }
              }

              const [fundamentals, newsRaw] = await Promise.all([
                marketDataProvider.getFundamentals(symbol).catch(() => null),
                newsProvider.getNews(`${h.displaySym} stock`, 5).catch(() => []),
              ]);

              const uItem = lookupUniverse(symbol);
              const sectorChange = uItem ? await getSectorChangeForKey(uItem.sectorKey).catch(() => null) : null;

              const riskSnapshot = await prisma.marketRisk.findFirst({ orderBy: { createdAt: "desc" } });
              const riskScore = riskSnapshot ? riskSnapshot.score : 50;

              const indicators = candles.length >= 30 ? computeIndicators(candles) : null;
              const sentimentScore = newsRaw.length > 0 ? 0.1 : 0.0;

              const generatedRec = RecommendationEngine.generate({
                symbol,
                price: h.currentPrice || h.avgPrice,
                prevClose: h.currentPrice || h.avgPrice,
                indicators,
                fundamentals,
                sectorChangePct: sectorChange,
                marketRiskScore: riskScore,
                candlesCount: candles.length,
                newsSentimentScore: sentimentScore,
              });

              rec = {
                action: generatedRec.action,
                score: generatedRec.score,
                confidence: generatedRec.confidence,
                risk: generatedRec.risk,
                reasons: JSON.stringify(generatedRec.reasons),
                warnings: JSON.stringify(generatedRec.warnings),
                entryZoneMin: generatedRec.entryZone?.min ?? null,
                entryZoneMax: generatedRec.entryZone?.max ?? null,
                stopLoss: generatedRec.stopLoss ?? null,
                targetRangeMin: generatedRec.targetRange?.min ?? null,
                targetRangeMax: generatedRec.targetRange?.max ?? null,
                dataQuality: generatedRec.dataQuality,
              };
            } catch (err) {
              console.error(`[signals] Failed to calculate dynamic signals for ${symbol}:`, err);
              rec = {
                action: "WAIT",
                score: 50,
                confidence: 50,
                risk: "MODERATE",
                reasons: JSON.stringify(["Insufficient pricing or fundamentals history."]),
                warnings: JSON.stringify(["No technical data."]),
                entryZoneMin: null, entryZoneMax: null, stopLoss: null, targetRangeMin: null, targetRangeMax: null,
                dataQuality: 0
              };
            }
          }

          const uItem = lookupUniverse(symbol);
          portfolioSignals.push({
            id: rec.id || `portfolio-${symbol}`,
            symbol,
            displaySymbol: h.displaySym,
            name: h.displaySym,
            sector: uItem?.sector || "Other",
            exchange: h.exchange,
            action: rec.action,
            score: rec.score,
            confidence: rec.confidence,
            risk: rec.risk,
            reasons: typeof rec.reasons === "string" ? JSON.parse(rec.reasons) : rec.reasons,
            warnings: typeof rec.warnings === "string" ? JSON.parse(rec.warnings) : rec.warnings,
            entryZone: rec.entryZoneMin && rec.entryZoneMax ? { min: rec.entryZoneMin, max: rec.entryZoneMax } : null,
            stopLoss: rec.stopLoss,
            targetRange: rec.targetRangeMin && rec.targetRangeMax ? { min: rec.targetRangeMin, max: rec.targetRangeMax } : null,
            dataQuality: rec.dataQuality,
            quantity: h.quantity,
            avgPrice: h.avgPrice,
            currentPrice: h.currentPrice,
            unrealizedPnl: h.pl,
            investedValue: h.cost,
            currentValue: h.value,
          });
        }
      }
    }
  }

  // Calculate signals overview counts
  const buyCount = recommendations.filter((r: any) => r.action.includes("BUY")).length;
  
  let sellCount = 0;
  let holdCount = 0;
  let waitCount = 0;

  if (userId && brokerConnection.connected) {
    sellCount = portfolioSignals.filter((r: any) => r.action.includes("SELL") || r.action === "REDUCE").length;
    holdCount = portfolioSignals.filter((r: any) => r.action === "HOLD").length;
    waitCount = portfolioSignals.filter((r: any) => r.action === "WAIT").length;
  } else {
    sellCount = recommendations.filter((r: any) => r.action.includes("SELL") || r.action === "REDUCE").length;
    holdCount = recommendations.filter((r: any) => r.action === "HOLD").length;
    waitCount = recommendations.filter((r: any) => r.action === "WAIT").length;
  }

  const latestRisk = await prisma.marketRisk.findFirst({ orderBy: { createdAt: "desc" } });
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
    const risk = await prisma.marketRisk.findFirst({
      orderBy: { createdAt: "desc" },
    });
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
