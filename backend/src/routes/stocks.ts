import express from "express";
import { marketDataProvider, newsProvider, resolveStockQuote } from "../lib/providers";
import { buildStockAnalysis } from "../lib/services/stockAnalysis";
import { getSectorPerformance } from "../lib/services/market";
import { searchUniverse, lookupUniverse } from "../lib/universe";
import { computeMarketRisk } from "../lib/engine/marketRisk";
import { resolveIndexSymbol, CORE_INDICES } from "../lib/symbols";
import { pctChange } from "../lib/indicators";
import { ensureProfile } from "../lib/services/portfolio";
import { asyncHandler, ApiError, sourceMeta } from "../lib/http";
import { parse, v } from "../lib/validate";
import { prisma } from "../lib/prisma";

const router = express.Router();

async function currentMarketRiskScore(): Promise<number | null> {
  try {
    const resolved = CORE_INDICES.slice(0, 7).map((n) => resolveIndexSymbol(n));
    const quotes = await marketDataProvider.getQuotes(resolved.map((r) => r.providerSymbol));
    const byDisplay = Object.fromEntries(resolved.map((r) => [r.displaySymbol, quotes[r.providerSymbol] ?? null]));
    const risk = computeMarketRisk({
      niftyChange: pctChange(byDisplay["NIFTY 50"]?.price, byDisplay["NIFTY 50"]?.prevClose),
      sensexChange: pctChange(byDisplay["SENSEX"]?.price, byDisplay["SENSEX"]?.prevClose),
      bankNiftyChange: pctChange(byDisplay["BANK NIFTY"]?.price, byDisplay["BANK NIFTY"]?.prevClose),
      indiaVix: byDisplay["INDIA VIX"]?.price ?? null,
      spxChange: pctChange(byDisplay["S&P 500"]?.price, byDisplay["S&P 500"]?.prevClose),
      nasdaqChange: pctChange(byDisplay["NASDAQ"]?.price, byDisplay["NASDAQ"]?.prevClose),
      dowChange: pctChange(byDisplay["DOW JONES"]?.price, byDisplay["DOW JONES"]?.prevClose),
    });
    return risk.score;
  } catch {
    return null;
  }
}

router.get(
  "/search",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (!q) return res.json({ results: [] });
    const local = searchUniverse(q, 10);
    const results: { symbol: string; display: string; name: string; exchange: string; sector: string; source: string }[] = local.map((u) => ({
      symbol: u.symbol,
      display: u.display,
      name: u.name,
      exchange: u.exchange,
      sector: u.sector,
      source: "universe",
    }));
    if (results.length < 5) {
      const remote = await marketDataProvider.search(q, 8);
      const seen = new Set(results.map((r) => r.symbol));
      for (const r of remote) {
        if (!seen.has(r.symbol) && ["EQUITY", "ETF", "INDEX"].includes(r.type)) {
          results.push({ symbol: r.symbol, display: r.symbol.replace(/\.(NS|BO)$/, ""), name: r.name, exchange: r.exchange, sector: "", source: "provider" });
          seen.add(r.symbol);
        }
      }
    }
    return res.json({ results: results.slice(0, 15) });
  })
);

router.get(
  "/sectors",
  asyncHandler(async (_req, res) => {
    const perf = await getSectorPerformance();
    return res.json({ sectors: perf, meta: sourceMeta(marketDataProvider.id) });
  })
);

router.get(
  "/:symbol",
  asyncHandler(async (req, res) => {
    const symbolRaw = req.params.symbol;
    const marketRiskScore = await currentMarketRiskScore();

    let ownedQuantity = 0;
    let portfolioWeightPct: number | null = null;
    let riskTolerance: "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE" = "MODERATE";
    let horizonYears = 5;

    if (req.user) {
      const profile = await ensureProfile(req.user.id).catch(() => null);
      if (profile) {
        riskTolerance = profile.riskTolerance as typeof riskTolerance;
        horizonYears = profile.horizonYears;
      }
      const holdings = await prisma.holding.findMany({ where: { userId: req.user.id } });
      const resolved = await resolveStockQuote(symbolRaw);
      const holding = holdings.find((h) => h.stock === resolved.resolved.providerSymbol);
      if (holding) {
        ownedQuantity = holding.quantity;
        const quotes = await marketDataProvider.getQuotes(holdings.map((h) => h.stock));
        const totalValue = holdings.reduce((sum, h) => sum + (quotes[h.stock]?.price ?? h.avgPrice) * h.quantity, 0);
        const thisValue = (quotes[holding.stock]?.price ?? holding.avgPrice) * holding.quantity;
        portfolioWeightPct = totalValue > 0 ? (thisValue / totalValue) * 100 : null;
      }
    }

    const analysis = await buildStockAnalysis(symbolRaw, {
      ownedQuantity,
      portfolioWeightPct: portfolioWeightPct ?? undefined,
      riskTolerance,
      horizonYears,
      marketRiskScore,
    });
    if (!analysis.found) {
      return res.status(404).json({ error: "Stock not found on NSE, BSE, or global markets", resolved: analysis.resolved });
    }
    return res.json(analysis);
  })
);

router.get(
  "/:symbol/candles",
  asyncHandler(async (req, res) => {
    const { range } = parse({ range: v.withDefault(v.enumOf(["1D", "1W", "1M", "3M", "6M", "1Y", "5Y", "MAX"] as const), "3M") }, req.query as Record<string, unknown>);
    const { quote, resolved } = await resolveStockQuote(req.params.symbol);
    if (!quote) throw ApiError.notFound("Stock not found");
    const candles = await marketDataProvider.getCandles(resolved.providerSymbol, range);
    return res.json({ symbol: resolved.providerSymbol, range, candles, meta: sourceMeta(marketDataProvider.id) });
  })
);

router.get(
  "/:symbol/news",
  asyncHandler(async (req, res) => {
    const entry = lookupUniverse(req.params.symbol);
    const limit = Math.min(30, Number(req.query.limit) || 15);
    const news = await newsProvider.getNews(`${entry?.display ?? req.params.symbol} stock`, limit);
    return res.json({ news, meta: sourceMeta(newsProvider.id) });
  })
);

export default router;
