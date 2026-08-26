import express from "express";
import { marketDataProvider } from "../lib/providers";
import { resolveIndexSymbol, CORE_INDICES, MACRO_SYMBOLS } from "../lib/symbols";
import { computeMarketRisk } from "../lib/engine/marketRisk";
import { pctChange } from "../lib/indicators";
import { getEnrichedHoldings, ensureProfile } from "../lib/services/portfolio";
import { getSectorPerformance } from "../lib/services/market";
import { prisma } from "../lib/prisma";
import { asyncHandler, sourceMeta } from "../lib/http";

const router = express.Router();

async function loadCoreMarket() {
  const resolved = CORE_INDICES.map((name) => resolveIndexSymbol(name));
  const quotes = await marketDataProvider.getQuotes(resolved.map((r) => r.providerSymbol));
  const byDisplay = Object.fromEntries(resolved.map((r) => [r.displaySymbol, quotes[r.providerSymbol] ?? null]));

  const indices = resolved.map((r) => {
    const q = quotes[r.providerSymbol];
    return { symbol: r.displaySymbol, price: q?.price ?? null, prevClose: q?.prevClose ?? null, pctChange: q ? pctChange(q.price, q.prevClose) : null };
  });

  const risk = computeMarketRisk({
    niftyChange: pctChange(byDisplay["NIFTY 50"]?.price, byDisplay["NIFTY 50"]?.prevClose),
    sensexChange: pctChange(byDisplay["SENSEX"]?.price, byDisplay["SENSEX"]?.prevClose),
    bankNiftyChange: pctChange(byDisplay["BANK NIFTY"]?.price, byDisplay["BANK NIFTY"]?.prevClose),
    indiaVix: byDisplay["INDIA VIX"]?.price ?? null,
    spxChange: pctChange(byDisplay["S&P 500"]?.price, byDisplay["S&P 500"]?.prevClose),
    nasdaqChange: pctChange(byDisplay["NASDAQ"]?.price, byDisplay["NASDAQ"]?.prevClose),
    dowChange: pctChange(byDisplay["DOW JONES"]?.price, byDisplay["DOW JONES"]?.prevClose),
  });

  return { indices, risk, byDisplay };
}

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { indices, risk } = await loadCoreMarket();
    const availableFactors = risk.factors.filter((f) => f.available).length;
    return res.json({
      provider: marketDataProvider.id,
      generatedAt: new Date().toISOString(),
      indices,
      risk,
      dataCompleteness: `${availableFactors}/${risk.factors.length} risk factors available`,
      meta: sourceMeta(marketDataProvider.id),
    });
  })
);

router.get(
  "/macro",
  asyncHandler(async (_req, res) => {
    const resolved = MACRO_SYMBOLS.map((name) => resolveIndexSymbol(name));
    const quotes = await marketDataProvider.getQuotes(resolved.map((r) => r.providerSymbol));
    const items = resolved.map((r) => {
      const q = quotes[r.providerSymbol];
      return { symbol: r.displaySymbol, price: q?.price ?? null, pctChange: q ? pctChange(q.price, q.prevClose) : null };
    });
    return res.json({ items, meta: sourceMeta(marketDataProvider.id) });
  })
);

router.get(
  "/sectors",
  asyncHandler(async (_req, res) => {
    const sectors = await getSectorPerformance();
    return res.json({ sectors, meta: sourceMeta(marketDataProvider.id) });
  })
);

/** "Your Market Brief" — the personalized morning summary. */
router.get(
  "/brief",
  asyncHandler(async (req, res) => {
    const { risk, indices } = await loadCoreMarket();
    const notable = indices.filter((i) => i.pctChange != null).sort((a, b) => Math.abs(b.pctChange!) - Math.abs(a.pctChange!)).slice(0, 3);

    let portfolioValue = 0;
    let portfolioChangeEstimate: number | null = null;
    let holdingsCount = 0;
    if (req.user) {
      const [holdings, profile] = await Promise.all([getEnrichedHoldings(req.user.id), ensureProfile(req.user.id).catch(() => null)]);
      portfolioValue = holdings.reduce((s, h) => s + h.value, 0);
      holdingsCount = holdings.length;
      const nifty = indices.find((i) => i.symbol === "NIFTY 50");
      if (nifty?.pctChange != null && portfolioValue > 0) {
        // Rough portfolio-level estimate from broad-market beta, pending real per-stock attribution.
        portfolioChangeEstimate = (portfolioValue * nifty.pctChange) / 100;
      }
    }

    const drivers = notable.map((n) => `${n.symbol} ${n.pctChange! >= 0 ? "up" : "down"} ${Math.abs(n.pctChange!).toFixed(2)}%`);

    let unreadCount = 0;
    if (req.user) unreadCount = await prisma.notification.count({ where: { userId: req.user.id, readAt: null } });

    return res.json({
      generatedAt: new Date().toISOString(),
      marketRisk: { score: risk.score, classification: risk.classification, reasons: risk.reasons },
      drivers,
      portfolio: req.user ? { value: portfolioValue, holdingsCount, estimatedChangeToday: portfolioChangeEstimate } : null,
      unreadNotifications: unreadCount,
      action:
        risk.score >= 71
          ? "Market risk is elevated — review concentrated positions before adding new ones."
          : holdingsCount > 0
          ? "Nothing requires immediate action."
          : "Nothing to review yet — your portfolio is empty.",
    });
  })
);

export default router;
