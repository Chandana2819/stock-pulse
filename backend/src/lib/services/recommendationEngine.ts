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
    ownedQuantity?: number;
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
      avgVolume: input.indicators?.avgVolume20d ?? null,
      volume: input.indicators?.currentVolume ?? null,
      ownedQuantity: input.ownedQuantity,
      candlesCount: input.candlesCount,
    });

    // Compute Entry Zone, Stop Loss, and Target Range for BUY/STRONG BUY signals
    let entryZone: RecommendationResult["entryZone"] = null;
    let stopLoss: RecommendationResult["stopLoss"] = null;
    let targetRange: RecommendationResult["targetRange"] = null;

    if (decision.signal === "BUY" || decision.signal === "STRONG BUY") {
      const price = input.price;
      const atrVal = input.indicators?.atr14 ?? (price * 0.025);
      
      stopLoss = Number((price - 2 * atrVal).toFixed(2));
      entryZone = {
        min: Number((price - 0.015 * price).toFixed(2)),
        max: Number((price + 0.005 * price).toFixed(2)),
      };
      targetRange = {
        min: Number((price + 0.08 * price).toFixed(2)),
        max: Number((price + 0.16 * price).toFixed(2)),
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
