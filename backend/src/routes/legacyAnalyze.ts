import express from "express";
import { analyzeLogic } from "../lib/logic";
import { resolveStockQuote, marketDataProvider, newsProvider } from "../lib/providers";
import { asyncHandler } from "../lib/http";

const router = express.Router();

/**
 * Legacy /api/analyze — kept byte-compatible with the original v1 frontend
 * response shape (stock/price/candles/risk/suggestion/action/reason/news) so
 * older cached frontend bundles keep working. New frontend code calls
 * /api/stocks/:symbol, which returns the full decision-engine breakdown.
 */
router.post(
  "/analyze",
  asyncHandler(async (req, res) => {
    let { stock } = req.body;
    stock = (stock ?? "").toString().toUpperCase();
    if (!stock.trim()) return res.status(400).json({ error: "Stock symbol is required" });

    const { quote, resolved } = await resolveStockQuote(stock);
    if (!quote) {
      return res.json({
        stock,
        price: 0,
        prevClose: 0,
        candles: [],
        risk: "Invalid",
        suggestion: "Check stock symbol",
        action: "NOT FOUND",
        reason: "Stock not found on NSE, BSE, or global markets",
        signal: "neutral",
        alertLevel: "danger",
        news: [],
      });
    }

    const candles = await marketDataProvider.getCandles(resolved.providerSymbol, "3M");
    const analysis = analyzeLogic(resolved.providerSymbol, quote.price, quote.prevClose ?? undefined);
    const news = await newsProvider.getNews(`${resolved.displaySymbol} stock`, 10).catch(() => []);

    return res.json({
      stock: resolved.providerSymbol,
      price: quote.price,
      prevClose: quote.prevClose,
      dayHigh: quote.dayHigh,
      dayLow: quote.dayLow,
      week52High: quote.week52High,
      week52Low: quote.week52Low,
      volume: quote.volume,
      avgVolume: quote.avgVolume,
      candles,
      ...analysis,
      news: news.length ? news : [{ title: `No major news for ${stock}`, link: "#", pubDate: "", source: "" }],
    });
  })
);

export default router;
