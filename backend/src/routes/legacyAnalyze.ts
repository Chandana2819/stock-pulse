import express from "express";
import { buildStockAnalysis } from "../lib/services/stockAnalysis";
import { currentMarketRiskScore } from "./stocks";
import { asyncHandler } from "../lib/http";
import type { Decision } from "../lib/engine/decision";

const router = express.Router();

const RISK_LABEL: Record<string, string> = {
  LOW: "Low",
  MODERATE: "Medium",
  HIGH: "High",
  "VERY HIGH": "High",
};

const SIGNAL_BY_DECISION: Record<Decision, "bullish" | "bearish" | "neutral"> = {
  BUY: "bullish",
  WATCH: "bullish",
  HOLD: "neutral",
  WAIT: "neutral",
  REDUCE: "bearish",
  AVOID: "bearish",
};

const ALERT_BY_DECISION: Record<Decision, "danger" | "warning" | "success" | "info"> = {
  BUY: "success",
  WATCH: "info",
  HOLD: "info",
  WAIT: "warning",
  REDUCE: "warning",
  AVOID: "danger",
};

/**
 * Legacy /api/analyze — kept byte-compatible with the original v1 frontend
 * response shape (stock/price/candles/risk/suggestion/action/reason/news),
 * but now backed by the same explainable decision engine (lib/engine/decision.ts)
 * that powers /api/stocks/:symbol, instead of the old same-day-%-change heuristic.
 */
router.post(
  "/analyze",
  asyncHandler(async (req, res) => {
    let { stock } = req.body;
    stock = (stock ?? "").toString().toUpperCase();
    if (!stock.trim()) return res.status(400).json({ error: "Stock symbol is required" });

    const marketRiskScore = await currentMarketRiskScore();
    const analysis = await buildStockAnalysis(stock, { marketRiskScore });

    if (!analysis.found) {
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

    const { quote, candles, decision, news, resolved } = analysis;
    const action: string = decision.validationFailed ? "WAIT" : decision.decision;
    const signal = decision.validationFailed ? "neutral" : SIGNAL_BY_DECISION[decision.decision as Decision];
    const alertLevel = decision.validationFailed ? "warning" : ALERT_BY_DECISION[decision.decision as Decision];
    const suggestion = decision.validationFailed
      ? decision.validationReason
      : decision.reasons[0] ?? "See full analysis for details.";
    const reason = decision.validationFailed ? decision.validationReason : decision.mainRisk;

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
      risk: RISK_LABEL[decision.riskLevel] ?? decision.riskLevel,
      suggestion,
      action,
      reason,
      signal,
      alertLevel,
      news: news.length ? news : [{ title: `No major news for ${stock}`, link: "#", pubDate: "", source: "" }],
    });
  })
);

export default router;
