import express from "express";
import { prisma } from "../lib/prisma";
import { getEnrichedHoldings, computePortfolioXirr, ensureProfile } from "../lib/services/portfolio";
import { diagnosePortfolio, type HoldingLite } from "../lib/engine/portfolioDoctor";
import { analyzeBehavior } from "../lib/engine/behavior";
import { lookupUniverse } from "../lib/universe";
import { marketDataProvider } from "../lib/providers";
import { asyncHandler, ApiError } from "../lib/http";
import { cagr } from "../lib/finance";

const router = express.Router();

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
