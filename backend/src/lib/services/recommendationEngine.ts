import type { IndicatorSnapshot } from "../indicators";
import type { FundamentalsData } from "../providers/types";
import { computeDecision, type SignalAction, type DecisionScores } from "../engine/decision";

export type { SignalAction };

export type RecommendationResult = {
  symbol: string;
  action: SignalAction;
  score: number; // 0-100 (final score)
  scores: DecisionScores;
  confidence: number; // 0-100
  risk: "LOW" | "MODERATE" | "HIGH" | "VERY HIGH";
  reasons: string[];
  warnings: string[];
  entryZone: { min: number; max: number } | null;
  stopLoss: number | null;
  targetRange: { min: number; max: number } | null;
  dataQuality: number; // 0-100 score
  dataQualityLabel: "EXCELLENT" | "GOOD" | "MODERATE" | "POOR" | "INSUFFICIENT";
  generatedAt: Date;
};

export class RecommendationEngine {
  static generate(input: {
    symbol: string;
    price: number;
    prevClose: number | null;
    indicators: IndicatorSnapshot | null;
    fundamentals: FundamentalsData | null;
    sectorChangePct: number | null;
    marketRiskScore: number; // 0-100
    candlesCount: number;
    newsSentimentScore?: number | null;
    newsArticles?: Array<{ title: string; sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE" }>;
    avgVolume?: number | null;
    volume?: number | null;
    // Real-market intelligence signals
    circuitHit?: boolean;
    bulkSellAlert?: boolean;
    negativeAnnouncement?: boolean;
    negativeKeyword?: string | null;
    suspectedPump?: boolean;
    marketCapCrore?: number | null;
  }): RecommendationResult {
    const priceChangePct = input.prevClose && input.prevClose > 0 
      ? ((input.price - input.prevClose) / input.prevClose) * 100 
      : null;

    const decision = computeDecision({
      symbol: input.symbol,
      price: input.price,
      fundamentals: input.fundamentals,
      indicators: input.indicators,
      priceChangePct,
      marketRiskScore: input.marketRiskScore,
      sectorChangePct: input.sectorChangePct,
      newsArticles: input.newsArticles,
      volatility30d: input.indicators?.volatility30d ?? null,
      avgVolume: input.avgVolume ?? null,
      volume: input.volume ?? null,
      candlesCount: input.candlesCount,
      circuitHit: input.circuitHit,
      bulkSellAlert: input.bulkSellAlert,
      negativeAnnouncement: input.negativeAnnouncement,
      negativeKeyword: input.negativeKeyword,
      suspectedPump: input.suspectedPump,
      marketCapCrore: input.marketCapCrore,
    });

    // Compute Entry Zone, Stop Loss, and Target Range
    const price = input.price;
    const atrVal = input.indicators?.atr14 ?? (price * 0.025);

    // Stop Loss: 2×ATR below entry (standard risk management)
    // Target Range: 3×ATR above entry (min) to 5×ATR above entry (max)
    // This gives a risk:reward of 1.5:1 minimum, scaling with actual volatility
    // instead of fixed % which ignores how the stock actually moves.
    const stopLoss: number = Number((price - 2 * atrVal).toFixed(2));
    const targetRange = {
      min: Number((price + 3 * atrVal).toFixed(2)),  // 1.5:1 R:R minimum
      max: Number((price + 5 * atrVal).toFixed(2)),  // 2.5:1 R:R stretch
    };

    // Entry Zone only generated for BUY / STRONG BUY signals
    let entryZone: RecommendationResult["entryZone"] = null;
    if (decision.signal === "BUY" || decision.signal === "STRONG BUY") {
      entryZone = {
        min: Number((price * 0.985).toFixed(2)),
        max: Number((price * 1.005).toFixed(2)),
      };
    }

    // Map risk sub-score to risk label
    let riskLabel: RecommendationResult["risk"] = "MODERATE";
    if (decision.scores.risk >= 70) riskLabel = "LOW";
    else if (decision.scores.risk >= 50) riskLabel = "MODERATE";
    else if (decision.scores.risk >= 30) riskLabel = "HIGH";
    else riskLabel = "VERY HIGH";

    return {
      symbol: input.symbol,
      action: decision.signal,
      score: decision.scores.final,
      scores: decision.scores,
      confidence: decision.confidence,
      risk: riskLabel,
      reasons: decision.reasons,
      warnings: decision.warnings,
      entryZone,
      stopLoss,
      targetRange,
      dataQuality: decision.dataQualityScore,
      dataQualityLabel: decision.dataQuality,
      generatedAt: new Date(),
    };
  }
}
