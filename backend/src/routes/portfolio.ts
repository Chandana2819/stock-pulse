import express from "express";
import { prisma } from "../lib/prisma";
import { getEnrichedHoldings, computePortfolioXirr, ensureProfile } from "../lib/services/portfolio";
import { diagnosePortfolio, type HoldingLite } from "../lib/engine/portfolioDoctor";
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
    const holdings = await getEnrichedHoldings(req.user!.id);
    return res.json({ holdings, user: { walletInr: user.walletInr, walletUsd: user.walletUsd } });
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

    const portfolioSignals: any[] = [];

    for (const h of holdings) {
      const symbol = h.stock;
      const analysis = await buildStockAnalysis(symbol, {
        ownedQuantity: h.quantity,
      }).catch(() => null);

      const ltp = analysis?.quote?.price ?? h.currentPrice ?? h.avgPrice;
      const avgPrice = h.avgPrice;
      const quantity = h.quantity;

      const pnl = Number(((ltp - avgPrice) * quantity).toFixed(2));
      const pnlPercentage = avgPrice > 0 ? Number((((ltp - avgPrice) / avgPrice) * 100).toFixed(2)) : 0;

      if (analysis && analysis.found) {
        portfolioSignals.push({
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
        });
      } else {
        portfolioSignals.push({
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
        });
      }
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

export default router;
