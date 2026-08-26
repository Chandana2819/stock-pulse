import express from "express";
import { prisma } from "../lib/prisma";
import { searchUniverse } from "../lib/universe";
import { fundProvider } from "../lib/providers";
import { asyncHandler } from "../lib/http";

const router = express.Router();

/** One search box across stocks, mutual funds, sectors, and (when signed in) the user's own watchlist/holdings. */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (!q) return res.json({ stocks: [], funds: [], sectors: [], watchlisted: [], held: [] });

    const stocks = searchUniverse(q, 8);
    const funds = await fundProvider.search(q, 5).catch(() => []);
    const sectorHits = [...new Set(stocks.map((s) => s.sector))];

    let watchlisted: string[] = [];
    let held: string[] = [];
    if (req.user) {
      const symbols = stocks.map((s) => s.symbol);
      const [wl, hd] = await Promise.all([
        prisma.watchlistItem.findMany({ where: { userId: req.user.id, symbol: { in: symbols } }, select: { symbol: true } }),
        prisma.holding.findMany({ where: { userId: req.user.id, stock: { in: symbols } }, select: { stock: true } }),
      ]);
      watchlisted = wl.map((w) => w.symbol);
      held = hd.map((h) => h.stock);
    }

    return res.json({
      stocks: stocks.map((s) => ({ ...s, inWatchlist: watchlisted.includes(s.symbol), held: held.includes(s.symbol) })),
      funds,
      sectors: sectorHits,
    });
  })
);

export default router;
