import express from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, ApiError } from "../lib/http";
import { runMarketScan } from "../lib/services/scanner";
import { runBacktest } from "../lib/services/backtest";
import { UNIVERSE, type UniverseEntry } from "../lib/universe";

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const actionFilter = req.query.action ? String(req.query.action).toUpperCase() : null;
    const sectorFilter = req.query.sector ? String(req.query.sector) : null;
    const exchangeFilter = req.query.exchange ? String(req.query.exchange).toUpperCase() : null;
    const sortBy = req.query.sortBy ? String(req.query.sortBy) : "score"; // score | confidence | risk | symbol

    // Fetch all recommendations
    let recommendations = await prisma.stockRecommendation.findMany();

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
      // Default sort: Score (descending)
      items.sort((a: any, b: any) => b.score - a.score);
    }

    // Calculate signals overview counts
    const buyCount = recommendations.filter((r: any) => r.action.includes("BUY")).length;
    const sellCount = recommendations.filter((r: any) => r.action.includes("SELL") || r.action === "REDUCE").length;
    const holdCount = recommendations.filter((r: any) => r.action === "HOLD").length;
    const waitCount = recommendations.filter((r: any) => r.action === "WAIT").length;

    return res.json({
      summary: {
        total: recommendations.length,
        buy: buyCount,
        sell: sellCount,
        hold: holdCount,
        wait: waitCount,
      },
      items,
    });
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
        classification: "MODERATE",
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
  asyncHandler(async (_req, res) => {
    // Allows triggering scan on demand via API
    runMarketScan().catch((err) => console.error("[api-scan] Scan run failed:", err));
    return res.json({ success: true, message: "Market scan triggered in background." });
  })
);

export default router;
