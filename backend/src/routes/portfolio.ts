import express from "express";
import { prisma } from "../lib/prisma";
import { getEnrichedHoldings, computePortfolioXirr, ensureProfile } from "../lib/services/portfolio";
import { getEnrichedMfHoldings } from "../lib/services/mfPortfolio";
import { diagnosePortfolio, type HoldingLite } from "../lib/engine/portfolioDoctor";
import { diagnosePortfolioLoss } from "../lib/engine/lossDiagnostic";
import { pctChange } from "../lib/indicators";
import { analyzeBehavior } from "../lib/engine/behavior";
import { lookupUniverse } from "../lib/universe";
import { marketDataProvider } from "../lib/providers";
import { asyncHandler, ApiError } from "../lib/http";
import { cagr } from "../lib/finance";
import { buildStockAnalysis } from "../lib/services/stockAnalysis";
import { requireAuth } from "../middleware/auth";

const router = express.Router();
router.use(requireAuth);

const USD_INR_FALLBACK = 87;

async function usdToInrRate(): Promise<number> {
  try {
    const q = await marketDataProvider.getQuote("INR=X");
    return q?.price && q.price > 30 ? q.price : USD_INR_FALLBACK;
  } catch {
    return USD_INR_FALLBACK;
  }
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw ApiError.notFound("User not found");
    const [holdings, mfData] = await Promise.all([
      getEnrichedHoldings(req.user!.id),
      getEnrichedMfHoldings(req.user!.id),
    ]);
    return res.json({
      holdings,
      mfHoldings: mfData.holdings,
      mfSummary: mfData.summary,
      user: { walletInr: user.walletInr, walletUsd: user.walletUsd },
    });
  })
);

// GET /api/portfolio/signals - Dynamic portfolio signal engine according to ChatGPT spec
router.get(
  "/signals",
  asyncHandler(async (req, res) => {
    let holdings: any[] = [];
    if (req.user) {
      holdings = await getEnrichedHoldings(req.user.id);
    }

    // Each holding's analysis (quote + 5Y candles + fundamentals + news) is
    // independent of the others, but was previously awaited one holding at a
    // time — N holdings meant N times the per-symbol latency stacked up
    // sequentially. Bounded-concurrency batching (matching the pattern
    // already used for bulk quotes) gets the same data without opening one
    // socket per holding at once.
    const ANALYSIS_BATCH_SIZE = 6;
    const portfolioSignals: any[] = [];

    for (let i = 0; i < holdings.length; i += ANALYSIS_BATCH_SIZE) {
      const batch = holdings.slice(i, i + ANALYSIS_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (h) => {
          const symbol = h.stock;
          const analysis = await buildStockAnalysis(symbol).catch(() => null);

          const ltp = analysis?.quote?.price ?? h.currentPrice ?? h.avgPrice;
          const avgPrice = h.avgPrice;
          const quantity = h.quantity;

          const pnl = Number(((ltp - avgPrice) * quantity).toFixed(2));
          const pnlPercentage = avgPrice > 0 ? Number((((ltp - avgPrice) / avgPrice) * 100).toFixed(2)) : 0;

          if (analysis && analysis.found) {
            return {
              symbol: analysis.resolved.displaySymbol,
              providerSymbol: symbol,
              quantity,
              averagePrice: avgPrice,
              currentPrice: ltp,
              pnl,
              pnlPercentage,
              scores: analysis.decision.scores,
              pillars: analysis.decision.pillars,
              finalScore: analysis.decision.scores.final,
              signal: analysis.decision.signal,
              action: analysis.decision.signal,
              confidence: analysis.decision.confidence,
              reasons: analysis.decision.reasons,
              warnings: analysis.decision.warnings,
              mainRisk: analysis.decision.mainRisk,
              stopLoss: analysis.decision.stopLoss,
              targetRange: analysis.decision.targetRange,
              entryZone: analysis.decision.entryZone,
              riskLevel: analysis.decision.riskLevel,
              dataQuality: analysis.decision.dataQuality,
              dataTimestamp: analysis.decision.dataTimestamp,
              horizon: analysis.decision.horizon,
              activeSince: analysis.decision.activeSince,
            };
          }
          return {
            symbol: h.displaySym,
            providerSymbol: symbol,
            quantity,
            averagePrice: avgPrice,
            currentPrice: ltp,
            pnl,
            pnlPercentage,
            scores: { trend: 50, momentum: 50, volume: 50, fundamentals: 50, sentiment: 50, risk: 50, marketSector: 50, final: 50 },
            pillars: [],
            finalScore: 50,
            signal: "WAIT",
            action: "WAIT",
            confidence: 30,
            reasons: ["Market data currently unavailable for portfolio evaluation"],
            warnings: ["Insufficient live data"],
            mainRisk: "Insufficient live data to compute risk factors",
            stopLoss: null,
            targetRange: null,
            entryZone: null,
            riskLevel: "MODERATE",
            dataQuality: "INSUFFICIENT",
            dataTimestamp: new Date().toISOString(),
          };
        })
      );
      portfolioSignals.push(...batchResults);
    }

    const buyCount = portfolioSignals.filter((s) => s.signal === "BUY" || s.signal === "STRONG BUY").length;
    const sellCount = portfolioSignals.filter((s) => s.signal === "SELL" || s.signal === "STRONG SELL" || s.signal === "REDUCE").length;
    const holdCount = portfolioSignals.filter((s) => s.signal === "HOLD").length;
    const waitCount = portfolioSignals.filter((s) => s.signal === "WAIT").length;

    return res.json({
      summary: {
        total: portfolioSignals.length,
        buy: buyCount,
        sell: sellCount,
        hold: holdCount,
        wait: waitCount,
      },
      holdings: portfolioSignals,
    });
  })
);

router.delete(
  "/",
  asyncHandler(async (req, res) => {
    const stock = req.query.stock;
    if (!stock) throw ApiError.badRequest("Stock query param is required");
    const deleted = await prisma.holding.deleteMany({ where: { userId: req.user!.id, stock: stock.toString().toUpperCase().trim() } });
    return res.json({ success: true, count: deleted.count });
  })
);

router.get(
  "/health",
  asyncHandler(async (req, res) => {
    const [holdings, profile, fxRate, userRow] = await Promise.all([
      getEnrichedHoldings(req.user!.id),
      ensureProfile(req.user!.id),
      usdToInrRate(),
      prisma.user.findUnique({ where: { id: req.user!.id } }),
    ]);

    const lite: HoldingLite[] = holdings.map((h) => {
      const entry = lookupUniverse(h.stock);
      return { stock: h.stock, displaySym: h.displaySym, currency: h.currency as "INR" | "USD", value: h.value ?? 0, sectorKey: entry?.sectorKey ?? null, sector: entry?.sector ?? null };
    });

    const health = diagnosePortfolio({
      holdings: lite,
      cashInr: userRow?.walletInr ?? 0,
      cashUsd: userRow?.walletUsd ?? 0,
      usdToInr: fxRate,
      riskTolerance: profile.riskTolerance as "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE",
    });

    return res.json(health);
  })
);

router.get(
  "/performance",
  asyncHandler(async (req, res) => {
    const [holdings, transactions] = await Promise.all([
      getEnrichedHoldings(req.user!.id),
      prisma.transaction.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "asc" } }),
    ]);

    const totalValue = holdings.reduce((s, h) => s + (h.value ?? 0), 0);
    const totalCost = holdings.reduce((s, h) => s + h.cost, 0);
    const unrealizedPl = totalValue - totalCost;

    // Realized P&L via FIFO matching per stock.
    const lots = new Map<string, { qty: number; price: number }[]>();
    let realizedPl = 0;
    for (const t of transactions) {
      const list = lots.get(t.stock) ?? [];
      if (t.type === "BUY") {
        list.push({ qty: t.quantity, price: t.price });
      } else {
        let remaining = t.quantity;
        while (remaining > 0 && list.length > 0) {
          const lot = list[0];
          const matched = Math.min(lot.qty, remaining);
          realizedPl += (t.price - lot.price) * matched;
          lot.qty -= matched;
          remaining -= matched;
          if (lot.qty <= 0) list.shift();
        }
      }
      lots.set(t.stock, list);
    }

    const firstTx = transactions[0];
    const years = firstTx ? Math.max(0.02, (Date.now() - firstTx.createdAt.getTime()) / (365 * 24 * 3600 * 1000)) : null;
    const investedPrincipal = transactions.filter((t) => t.type === "BUY").reduce((s, t) => s + t.totalCost, 0);
    const cagrPct = years && investedPrincipal > 0 ? cagr(investedPrincipal, investedPrincipal + realizedPl + unrealizedPl, years) : null;
    const xirrPct = await computePortfolioXirr(req.user!.id);

    return res.json({
      totalValue,
      totalCost,
      unrealizedPl,
      unrealizedPlPct: totalCost > 0 ? (unrealizedPl / totalCost) * 100 : 0,
      realizedPl,
      cagrPct,
      xirrPct,
      holdingsCount: holdings.length,
      transactionsCount: transactions.length,
    });
  })
);

router.get(
  "/behavior",
  asyncHandler(async (req, res) => {
    const [transactions, profile] = await Promise.all([
      prisma.transaction.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "asc" } }),
      ensureProfile(req.user!.id),
    ]);
    const analysis = analyzeBehavior(
      transactions.map((t) => ({ stock: t.stock, type: t.type as "BUY" | "SELL", price: t.price, quantity: t.quantity, createdAt: t.createdAt })),
      profile.riskTolerance as "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE"
    );
    return res.json(analysis);
  })
);

const ZERODHA_SNAPSHOT_HOLDINGS = [
  { stock: "BEL.NS", displaySym: "BEL", quantity: 24, avgPrice: 450.54, exchange: "NSE", currency: "INR" },
  { stock: "ONGC.NS", displaySym: "ONGC", quantity: 31, avgPrice: 274.22, exchange: "NSE", currency: "INR" },
  { stock: "COALINDIA.NS", displaySym: "COALINDIA", quantity: 5, avgPrice: 460.74, exchange: "NSE", currency: "INR" },
  { stock: "INFY.NS", displaySym: "INFY", quantity: 1, avgPrice: 1298.30, exchange: "NSE", currency: "INR" },
  { stock: "IRFC.NS", displaySym: "IRFC", quantity: 2, avgPrice: 100.75, exchange: "NSE", currency: "INR" },
  { stock: "RELIANCE.NS", displaySym: "RELIANCE", quantity: 2, avgPrice: 1336.35, exchange: "NSE", currency: "INR" },
  { stock: "TATAPOWER.NS", displaySym: "TATAPOWER", quantity: 4, avgPrice: 395.85, exchange: "NSE", currency: "INR" },
  { stock: "ADANIGREEN.NS", displaySym: "ADANIGREEN", quantity: 3, avgPrice: 1020.20, exchange: "NSE", currency: "INR" },
  { stock: "MON100.NS", displaySym: "MON100", quantity: 6, avgPrice: 247.28, exchange: "NSE", currency: "INR" },
  { stock: "MASPTOP50.NS", displaySym: "MASPTOP50", quantity: 6, avgPrice: 75.00, exchange: "NSE", currency: "INR" },
  { stock: "TATAGOLD.NS", displaySym: "TATAGOLD", quantity: 102, avgPrice: 14.61, exchange: "NSE", currency: "INR" },
];

router.post(
  "/seed-zerodha",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    // Clear any previous variations (with or without .NS) so holdings never duplicate
    const allSymbols = ZERODHA_SNAPSHOT_HOLDINGS.flatMap((i) => [i.stock, i.displaySym]);
    await prisma.holding.deleteMany({
      where: {
        userId,
        stock: { in: allSymbols },
      },
    });

    for (const item of ZERODHA_SNAPSHOT_HOLDINGS) {
      await prisma.holding.upsert({
        where: { userId_stock: { userId, stock: item.stock } },
        update: {
          quantity: item.quantity,
          avgPrice: item.avgPrice,
          exchange: item.exchange,
          currency: item.currency,
          displaySym: item.displaySym,
          source: "ZERODHA_IMPORT",
          broker: "ZERODHA",
        },
        create: {
          userId,
          stock: item.stock,
          quantity: item.quantity,
          avgPrice: item.avgPrice,
          exchange: item.exchange,
          currency: item.currency,
          displaySym: item.displaySym,
          source: "ZERODHA_IMPORT",
          broker: "ZERODHA",
        },
      });
    }

    const holdings = await getEnrichedHoldings(userId);
    return res.json({ success: true, count: ZERODHA_SNAPSHOT_HOLDINGS.length, holdings });
  })
);

router.get(
  "/loss-diagnosis",
  asyncHandler(async (req, res) => {
    const holdings = await getEnrichedHoldings(req.user!.id);

    // Fetch live Nifty 50 and India VIX quotes for real-time backdrop
    let niftyChange: number | null = 0.52;
    let indiaVix: number | null = 14.2;

    try {
      const quotes = await marketDataProvider.getQuotes(["^NSEI", "^INDIAVIX"]);
      const nifty = quotes["^NSEI"];
      const vix = quotes["^INDIAVIX"];
      if (nifty?.price && nifty?.prevClose) {
        niftyChange = pctChange(nifty.price, nifty.prevClose);
      }
      if (vix?.price) {
        indiaVix = vix.price;
      }
    } catch (e) {
      console.warn("[loss-diagnosis] Live index fetch failed, using fallback:", e);
    }

    const liteHoldings = holdings.map((h) => ({
      stock: h.stock,
      displaySym: h.displaySym,
      quantity: h.quantity,
      avgPrice: h.avgPrice,
      currentPrice: h.currentPrice,
      cost: h.cost,
      value: h.value,
      pl: h.pl,
      plPct: h.plPct,
    }));

    const diagnosis = diagnosePortfolioLoss({
      holdings: liteHoldings,
      niftyDayChange: niftyChange,
      indiaVix,
    });

    return res.json(diagnosis);
  })
);

export default router;
