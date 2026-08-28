import type { IndicatorSnapshot } from "../indicators";
import type { FundamentalsData } from "../providers/types";
import { SCORING_WEIGHTS } from "../../config/scoring";

export type SignalAction = "STRONG BUY" | "BUY" | "HOLD" | "SELL" | "STRONG SELL";

export type RecommendationResult = {
  symbol: string;
  action: SignalAction;
  score: number; // 0-100
  confidence: number; // 0-100
  risk: "LOW" | "MODERATE" | "HIGH" | "VERY HIGH";
  reasons: string[];
  warnings: string[];
  entryZone: { min: number; max: number } | null;
  stopLoss: number | null;
  targetRange: { min: number; max: number } | null;
  dataQuality: number; // 0-100
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
    newsSentimentScore: number | null; // -1 to +1
    /** Labels of upstream data calls that threw (e.g. "fundamentals", "news", "sector") —
     *  distinct from a provider returning a legitimate empty result. Surfaced verbatim
     *  as warnings so a data outage is visible instead of silently degrading the score. */
    providerErrors?: string[];
  }): RecommendationResult {
    const reasons: string[] = [];
    const warnings: string[] = [];

    // 1. Data Quality Evaluation
    let dataQuality = 100;
    if (input.candlesCount < 30) {
      dataQuality -= 50;
      warnings.push("Insufficient historical price candles (requires 30+ days).");
    } else if (input.candlesCount < 90) {
      dataQuality -= 15;
    }
    if (!input.fundamentals) {
      dataQuality -= 15;
      warnings.push("Fundamentals data coverage missing.");
    }
    if (!input.indicators) {
      dataQuality -= 25;
    }
    if (input.providerErrors && input.providerErrors.length > 0) {
      dataQuality -= 10 * input.providerErrors.length;
      for (const label of input.providerErrors) {
        warnings.push(`Data source unavailable: ${label} could not be fetched (temporary provider error, not a lack of data).`);
      }
    }
    dataQuality = Math.max(0, dataQuality);

    // 2. Score calculations for each pillar
    let technicalScore = 50; // default neutral
    let momentumScore = 50;
    let volumeScore = 50;
    let volatilityScore = 50;
    let marketScore = 100 - input.marketRiskScore; // 0 -> 100, 100 -> 0
    let sectorScore = 50;
    let fundamentalsScore = 50;
    let valuationScore = 50;
    let relativeStrengthScore = 50;
    let sentimentScore = 50;

    // A. Technical Trend Pillar
    if (input.indicators) {
      const ind = input.indicators;
      if (ind.trend === "UPTREND") {
        technicalScore = 90;
        reasons.push("30-day technical trend is bullish (uptrend).");
      } else if (ind.trend === "DOWNTREND") {
        technicalScore = 15;
        warnings.push("Technical trend is bearish (downtrend).");
      } else {
        technicalScore = 50;
      }
    }

    // B. Momentum Pillar
    if (input.indicators?.rsi14 != null) {
      const rsi = input.indicators.rsi14;
      if (rsi >= 70) {
        momentumScore = 40; // overbought
        warnings.push("RSI indicates overbought conditions.");
      } else if (rsi >= 55) {
        momentumScore = 85;
        reasons.push("Strong positive momentum (RSI > 55).");
      } else if (rsi <= 30) {
        momentumScore = 20;
        warnings.push("RSI indicates oversold momentum.");
      } else {
        momentumScore = 50;
      }
    }

    // C. Volume Pillar
    if (input.indicators?.volumeTrendRatio != null) {
      const volRatio = input.indicators.volumeTrendRatio;
      if (volRatio > 1.3) {
        volumeScore = 85;
        reasons.push("Trading volume confirms bullish momentum (above average).");
      } else if (volRatio < 0.6) {
        volumeScore = 30;
        warnings.push("Dull trading volumes (below average).");
      }
    }

    // D. Volatility/Risk Pillar
    if (input.indicators?.volatility30d != null) {
      const vol = input.indicators.volatility30d;
      if (vol > 55) {
        volatilityScore = 25;
        warnings.push("Extremely high 30-day volatility.");
      } else if (vol < 25) {
        volatilityScore = 80;
        reasons.push("Stable volatility profile.");
      }
    }

    // E. Sector Strength
    if (input.sectorChangePct != null) {
      if (input.sectorChangePct > 0.01) {
        sectorScore = 80;
        reasons.push("Sector index showing strong positive performance.");
      } else if (input.sectorChangePct < -0.01) {
        sectorScore = 25;
        warnings.push("Underlying sector index is declining.");
      }
    }

    // F. Fundamentals
    if (input.fundamentals) {
      const f = input.fundamentals;
      let scoreAcc = 50;
      let count = 0;
      if (f.roe != null) {
        scoreAcc += f.roe >= 18 ? 20 : f.roe >= 10 ? 5 : -15;
        count++;
      }
      if (f.revenueGrowth != null) {
        scoreAcc += f.revenueGrowth >= 12 ? 15 : f.revenueGrowth >= 5 ? 5 : -10;
        count++;
      }
      if (f.debtToEquity != null) {
        scoreAcc += f.debtToEquity < 0.5 ? 15 : f.debtToEquity > 1.5 ? -20 : 0;
        count++;
      }
      if (count > 0) {
        fundamentalsScore = Math.max(0, Math.min(100, scoreAcc));
        if (fundamentalsScore > 75) reasons.push("Core company fundamentals are strong.");
      }
    }

    // G. Valuation
    if (input.fundamentals?.peRatio != null) {
      const pe = input.fundamentals.peRatio;
      if (pe <= 0) {
        valuationScore = 35;
      } else if (pe < 15) {
        valuationScore = 85;
        reasons.push("Valuation is attractive (PE < 15).");
      } else if (pe > 40) {
        valuationScore = 20;
        warnings.push("High valuation multiple (PE > 40).");
      }
    }

    // H. Relative Strength (55-day lookback)
    if (input.indicators?.relativeStrength55 != null) {
      const rs = input.indicators.relativeStrength55;
      if (rs > 0.05) {
        relativeStrengthScore = 85;
        reasons.push("Outperforming benchmark market indexes.");
      } else if (rs < -0.05) {
        relativeStrengthScore = 20;
        warnings.push("Underperforming the broader market.");
      }
    }

    // I. News Sentiment
    if (input.newsSentimentScore != null) {
      sentimentScore = Math.max(0, Math.min(100, 50 + input.newsSentimentScore * 50));
      if (input.newsSentimentScore > 0.25) {
        reasons.push("Recent news sentiment is positive.");
      } else if (input.newsSentimentScore < -0.25) {
        warnings.push("Recent news sentiment is negative.");
      }
    }

    // 3. Compute weighted score
    const score = Math.round(
      technicalScore * SCORING_WEIGHTS.technicalTrend +
      momentumScore * SCORING_WEIGHTS.momentum +
      volumeScore * SCORING_WEIGHTS.volume +
      volatilityScore * SCORING_WEIGHTS.volatilityRisk +
      marketScore * SCORING_WEIGHTS.marketCondition +
      sectorScore * SCORING_WEIGHTS.sectorStrength +
      fundamentalsScore * SCORING_WEIGHTS.fundamentals +
      valuationScore * SCORING_WEIGHTS.valuation +
      relativeStrengthScore * SCORING_WEIGHTS.relativeStrength +
      sentimentScore * SCORING_WEIGHTS.newsSentiment
    );

    // 4. Calculate Market Condition Adjusted Confidence
    // If market risk is high, reduce the final confidence
    let baseConfidence = 50 + (score > 50 ? score - 50 : 50 - score) * 0.5;
    const marketRiskPenalty = (input.marketRiskScore / 100) * 20; // up to 20% penalty
    const confidence = Math.round(Math.max(30, Math.min(95, baseConfidence - marketRiskPenalty)));

    // 5. Calculate overall stock risk level
    const vol = input.indicators?.volatility30d ?? 30;
    const beta = input.fundamentals?.beta ?? 1.0;
    const riskFactor = vol * 0.4 + beta * 25 + input.marketRiskScore * 0.2;
    let risk: RecommendationResult["risk"] = "MODERATE";
    if (riskFactor > 70) risk = "VERY HIGH";
    else if (riskFactor > 48) risk = "HIGH";
    else if (riskFactor > 25) risk = "MODERATE";
    else risk = "LOW";

    // 6. Action selection logic
    let action: SignalAction = "HOLD";
    const marketTooRisky = input.marketRiskScore >= 75;

    if (score >= 80) {
      action = marketTooRisky ? "HOLD" : "STRONG BUY";
      if (marketTooRisky) reasons.push("Elevated market risk overrides BUY signal into HOLD.");
    } else if (score >= 68) {
      action = marketTooRisky ? "HOLD" : "BUY";
      if (marketTooRisky) reasons.push("Elevated market risk overrides BUY signal into HOLD.");
    } else if (score <= 25) {
      action = "STRONG SELL";
    } else if (score <= 46) {
      action = "SELL";
    } else if (score >= 58 && score < 68) {
      action = "HOLD";
      reasons.push("Short-term momentum or volume setup is incomplete; waiting for confirmation.");
    }

    if (dataQuality < 60) {
      action = "HOLD";
      reasons.push("HOLD: Data quality checks are low. Recommendation engine requires additional data.");
    }

    // Override: If technical trend is BEARISH (downtrend), we must NOT recommend BUY or STRONG BUY.
    // We should cap the action to HOLD to prevent catching a falling knife.
    if ((action === "BUY" || action === "STRONG BUY") && input.indicators?.trend === "DOWNTREND") {
      action = "HOLD";
      warnings.push("BUY setup overridden: Technical trend is bearish (downtrend).");
    }

    // 7. Calculate Entry Zone, Stop-Loss, and Target (Only for BUY/STRONG BUY)
    let entryZone: RecommendationResult["entryZone"] = null;
    let stopLoss: RecommendationResult["stopLoss"] = null;
    let targetRange: RecommendationResult["targetRange"] = null;

    if (action === "BUY" || action === "STRONG BUY") {
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

    return {
      symbol: input.symbol,
      action,
      score,
      confidence,
      risk,
      reasons: reasons.slice(0, 6),
      warnings: warnings.slice(0, 5),
      entryZone,
      stopLoss,
      targetRange,
      dataQuality,
      generatedAt: new Date(),
    };
  }
}
