import express from "express";
import { prisma } from "../lib/prisma";
import { marketDataProvider } from "../lib/providers";
import { pctChange } from "../lib/indicators";
import { asyncHandler, ApiError } from "../lib/http";
import { parse, v, SYMBOL_RE } from "../lib/validate";
import { requireAuth } from "../middleware/auth";

const router = express.Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const items = await prisma.watchlistItem.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } });
    return res.json(items.map((w) => w.symbol));
  })
);

/** Enriched watchlist: price, change, and a plain-English "what changed" note per symbol. */
router.get(
  "/enriched",
  asyncHandler(async (req, res) => {
    const items = await prisma.watchlistItem.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } });
    if (items.length === 0) return res.json({ items: [] });

    const symbols = items.map((w) => w.symbol);
    const quotes = await marketDataProvider.getQuotes(symbols);

    const enriched = items.map((w) => {
      const q = quotes[w.symbol];
      const changePct = q ? pctChange(q.price, q.prevClose) : null;
      return {
        symbol: w.symbol,
        note: w.note,
        targetPrice: w.targetPrice,
        addedAt: w.createdAt,
        price: q?.price ?? null,
        changePct,
        alert:
          changePct != null && Math.abs(changePct) >= 3
            ? `Moved ${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}% since yesterday's close`
            : w.targetPrice != null && q?.price != null && ((changePct ?? 0) >= 0 ? q.price >= w.targetPrice : q.price <= w.targetPrice)
            ? `Reached your target price of ${w.targetPrice}`
            : null,
      };
    });

    return res.json({ items: enriched });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { symbol, note, targetPrice, listName } = parse(
      { symbol: v.string({ min: 1, max: 24, pattern: SYMBOL_RE }), note: v.optional(v.string({ max: 300 })), targetPrice: v.optional(v.number({ min: 0 })), listName: v.withDefault(v.string({ max: 40 }), "Default") },
      req.body
    );
    const upperSym = symbol.toUpperCase();

    const item = await prisma.watchlistItem.upsert({
      where: { userId_symbol: { userId: req.user!.id, symbol: upperSym } },
      update: { note, targetPrice, listName },
      create: { userId: req.user!.id, symbol: upperSym, note, targetPrice, listName },
    });
    return res.json(item);
  })
);

router.delete(
  "/",
  asyncHandler(async (req, res) => {
    const symbol = req.query.symbol;
    if (!symbol) throw ApiError.badRequest("Symbol query param is required");
    await prisma.watchlistItem.deleteMany({ where: { userId: req.user!.id, symbol: symbol.toString().toUpperCase().trim() } });
    return res.json({ success: true });
  })
);

export default router;
