// Explainable decision engine for EQUistiq / BullHawk.
//
// Calculates normalized 0-100 scores across 7 pillars:
// 1. Trend (20%)
// 2. Momentum (15%)
// 3. Volume (10%)
// 4. Fundamentals (20%)
// 5. News / Sentiment (10%)
// 6. Stock Risk (10%) — 100 = Low Risk / Favorable
// 7. Market + Sector (15%)
//
// Signals produced: STRONG BUY | BUY | HOLD | REDUCE | SELL | STRONG SELL | WAIT

import type { FundamentalsData } from "../providers/types";
import type { IndicatorSnapshot } from "../indicators";
import { SCORING_WEIGHTS } from "../../config/scoring";
import { computeSignalHorizon, type SignalHorizon } from "./horizon";

export type SignalAction = "STRONG BUY" | "BUY" | "HOLD" | "REDUCE" | "SELL" | "STRONG SELL" | "WAIT";

export type PillarScore = {
  key: string;
  label: string;
  score: number; // 0..100
  weight: number;
  evidence: string[];
  available: boolean;
};

export type DecisionScores = {
  trend: number;
  momentum: number;
  volume: number;
  fundamentals: number;
  sentiment: number;
  risk: number;
  marketSector: number;
  final: number;
};

export type DecisionResult = {
  symbol: string;
  signal: SignalAction;
  confidence: number; // 0..100
  scores: DecisionScores;
  pillars: PillarScore[];
  reasons: string[];
  warnings: string[];
  mainRisk: string;
  wouldChange: string[];
  /** One plain-English sentence synthesizing *why* the signal is what it is — the thing reasons[] alone doesn't say. */
  synthesis: string;
  dataQuality: "EXCELLENT" | "GOOD" | "MODERATE" | "POOR" | "INSUFFICIENT";
  dataQualityScore: number; // 0..100
  horizon: SignalHorizon;
};

export type DecisionInput = {
  symbol: string;
  price: number;
  fundamentals: FundamentalsData | null;
  indicators: IndicatorSnapshot | null;
  priceChangePct: number | null;
  marketRiskScore: number | null; // 0..100, higher = higher market risk
  sectorChangePct: number | null;
  newsArticles?: Array<{ title: string; sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE"; sentimentScore?: number }>;
  volatility30d: number | null;
  avgVolume: number | null;
  volume: number | null;
  candlesCount?: number;
  // ── Real-market intelligence ─────────────────────────────────────────────
  /** Stock hit upper/lower circuit today (price move >9.5% in one session). */
  circuitHit?: boolean;
  /** Promoter / large FII bulk-sell deal detected today via NSE bulk/block data. */
  bulkSellAlert?: boolean;
  /** News keyword scan matched a SEBI/fraud/penalty/insolvency headline. */
  negativeAnnouncement?: boolean;
  /** Matched keyword from the negative announcement scan, for the warning message. */
  negativeKeyword?: string | null;
  /** Small-cap (marketCap <₹2000 cr) + volume spike >5× 20-day average → possible pump. */
  suspectedPump?: boolean;
  /** Market capitalisation in crore INR (used for small-cap pump detection). */
  marketCapCrore?: number | null;
};

export function classifySignal(score: number): SignalAction {
  if (score >= 80) return "STRONG BUY";
  if (score >= 65) return "BUY";
  if (score >= 55) return "HOLD";
  if (score >= 45) return "REDUCE";
  if (score >= 30) return "SELL";
  return "STRONG SELL";
}

function clamp0to100(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)));
}

// 1. TREND PILLAR (0-100)
function computeTrendPillar(ind: IndicatorSnapshot | null, priceChangePct: number | null): PillarScore {
  if (!ind) {
    return { key: "trend", label: "Trend", score: 50, weight: SCORING_WEIGHTS.trend, evidence: ["No technical trend data available"], available: false };
  }
  const evidence: string[] = [];
  let score = 50;

  const isUptrend = ind.trend === "UPTREND" || (ind.sma20 != null && ind.sma50 != null && ind.sma20 > ind.sma50 && ind.trend !== "DOWNTREND");
  const isDowntrend = ind.trend === "DOWNTREND" || (ind.sma20 != null && ind.sma50 != null && ind.sma20 < ind.sma50);

  if (isDowntrend) {
    score -= 30;
    evidence.push("Technical price trend is in a downtrend (SMA20 < SMA50)");
  } else if (isUptrend) {
    score += 30;
    evidence.push("Technical price trend is in a clear uptrend (SMA20 > SMA50)");
  } else {
    evidence.push("Price is consolidating near its moving averages");
  }

  if (ind.sma200 != null && ind.price != null) {
    if (ind.price > ind.sma200) {
      score += 15;
      evidence.push("Price is trading above 200-day moving average (long-term bull)");
    } else {
      score -= 15;
      evidence.push("Price is trading below 200-day moving average (long-term bear)");
    }
  }

  if (priceChangePct != null) {
    if (priceChangePct >= 3) {
      evidence.push(`Strong daily gain of +${priceChangePct.toFixed(2)}%`);
    } else if (priceChangePct <= -3) {
      evidence.push(`Significant daily drop of ${priceChangePct.toFixed(2)}%`);
    }
  }

  return { key: "trend", label: "Trend", score: clamp0to100(score), weight: SCORING_WEIGHTS.trend, evidence, available: true };
}

// 2. MOMENTUM PILLAR (0-100)
function computeMomentumPillar(ind: IndicatorSnapshot | null): PillarScore {
  if (!ind) {
    return { key: "momentum", label: "Momentum", score: 50, weight: SCORING_WEIGHTS.momentum, evidence: ["No momentum data available"], available: false };
  }
  const evidence: string[] = [];
  let score = 50;

  if (ind.rsi14 != null) {
    const rsi = ind.rsi14;
    // Interpretation first, raw number second — reasons[] (see computeDecision)
    // only ever surfaces evidence[0] per pillar, so the qualitative read has
    // to lead or a user only ever sees the bare RSI value with no context.
    if (rsi >= 50 && rsi <= 65) {
      score += 25; // healthy bullish momentum
      evidence.push("RSI indicates healthy bullish momentum");
    } else if (rsi > 65 && rsi < 75) {
      score += 15;
      evidence.push("RSI shows strong momentum (approaching overbought)");
    } else if (rsi >= 75) {
      score -= 10;
      evidence.push("RSI indicates overbought conditions (>75)");
    } else if (rsi >= 40 && rsi < 50) {
      evidence.push("RSI is neutral, no clear momentum either way");
    } else if (rsi >= 30 && rsi < 40) {
      score -= 15;
      evidence.push("RSI shows weak momentum");
    } else if (rsi < 30) {
      score -= 25;
      evidence.push("RSI indicates oversold conditions (<30)");
    }
    evidence.push(`RSI(14) is at ${rsi.toFixed(1)}`);
  }

  if (ind.macd) {
    if (ind.macd.histogram != null) {
      if (ind.macd.histogram > 0) {
        score += 15;
        evidence.push("MACD histogram is positive (bullish momentum)");
      } else {
        score -= 15;
        evidence.push("MACD histogram is negative (bearish momentum)");
      }
    }
  }

  return { key: "momentum", label: "Momentum", score: clamp0to100(score), weight: SCORING_WEIGHTS.momentum, evidence, available: true };
}

// 3. VOLUME PILLAR (0-100)
function computeVolumePillar(ind: IndicatorSnapshot | null, volume: number | null, avgVolume: number | null, priceChangePct: number | null): PillarScore {
  const evidence: string[] = [];
  let score = 50;

  const volRatio = ind?.volumeTrendRatio ?? (volume && avgVolume && avgVolume > 0 ? volume / avgVolume : null);

  if (volRatio != null) {
    // Interpretation first, raw ratio second — same reasoning as the
    // momentum/sentiment pillars: reasons[] (see computeDecision) only ever
    // surfaces evidence[0], so the qualitative read has to lead.
    if (volRatio >= 1.5) {
      if (priceChangePct != null && priceChangePct > 0) {
        score += 35;
        evidence.push("High volume accumulation on price rise");
      } else if (priceChangePct != null && priceChangePct < 0) {
        score -= 35;
        evidence.push("High volume distribution/selling pressure on price fall");
      } else {
        score += 10;
        evidence.push("Elevated volume with no clear price direction");
      }
    } else if (volRatio >= 1.0) {
      score += 10;
      evidence.push("Volume is in line with normal trading activity");
    } else if (volRatio < 0.6) {
      score -= 15;
      evidence.push("Low volume indicates lack of buying interest");
    } else {
      evidence.push("Volume is slightly below average, nothing notable");
    }
    evidence.push(`Volume is ${volRatio.toFixed(2)}x of 20-day average`);
  } else {
    return { key: "volume", label: "Volume", score: 50, weight: SCORING_WEIGHTS.volume, evidence: ["Volume average data unavailable"], available: false };
  }

  return { key: "volume", label: "Volume", score: clamp0to100(score), weight: SCORING_WEIGHTS.volume, evidence, available: true };
}

// 4. FUNDAMENTALS PILLAR (0-100)
function computeFundamentalsPillar(f: FundamentalsData | null): PillarScore {
  if (!f) {
    return { key: "fundamentals", label: "Fundamentals", score: 50, weight: SCORING_WEIGHTS.fundamentals, evidence: ["Fundamentals data unavailable"], available: false };
  }
  const evidence: string[] = [];
  let totalPoints = 0;
  let maxPoints = 0;

  if (f.roe != null) {
    maxPoints += 20;
    if (f.roe >= 20) { totalPoints += 20; evidence.push(`Strong ROE at ${f.roe.toFixed(1)}%`); }
    else if (f.roe >= 12) { totalPoints += 14; evidence.push(`Moderate ROE at ${f.roe.toFixed(1)}%`); }
    else if (f.roe >= 5) { totalPoints += 8; }
    else { evidence.push(`Low ROE at ${f.roe.toFixed(1)}%`); }
  }

  if (f.revenueGrowth != null) {
    maxPoints += 20;
    if (f.revenueGrowth >= 15) { totalPoints += 20; evidence.push(`High revenue growth +${f.revenueGrowth.toFixed(1)}%`); }
    else if (f.revenueGrowth >= 5) { totalPoints += 12; evidence.push(`Stable revenue growth +${f.revenueGrowth.toFixed(1)}%`); }
    else if (f.revenueGrowth >= 0) { totalPoints += 6; }
    else { evidence.push(`Declining revenue ${f.revenueGrowth.toFixed(1)}%`); }
  }

  if (f.profitGrowth != null) {
    maxPoints += 20;
    if (f.profitGrowth >= 15) { totalPoints += 20; evidence.push(`Strong profit growth +${f.profitGrowth.toFixed(1)}%`); }
    else if (f.profitGrowth >= 5) { totalPoints += 12; }
    else if (f.profitGrowth >= 0) { totalPoints += 6; }
    else { evidence.push(`Profit decline of ${f.profitGrowth.toFixed(1)}%`); }
  }

  if (f.debtToEquity != null) {
    maxPoints += 20;
    if (f.debtToEquity <= 0.5) { totalPoints += 20; evidence.push(`Low debt-to-equity ratio (${f.debtToEquity.toFixed(2)})`); }
    else if (f.debtToEquity <= 1.2) { totalPoints += 12; evidence.push(`Manageable debt-to-equity (${f.debtToEquity.toFixed(2)})`); }
    else { evidence.push(`High debt-to-equity ratio (${f.debtToEquity.toFixed(2)})`); }
  }

  if (f.freeCashFlow != null) {
    maxPoints += 20;
    if (f.freeCashFlow > 0) { totalPoints += 20; evidence.push("Positive free cash flow generation"); }
    else { evidence.push("Negative free cash flow"); }
  }

  if (maxPoints === 0) {
    return { key: "fundamentals", label: "Fundamentals", score: 50, weight: SCORING_WEIGHTS.fundamentals, evidence: ["Insufficient fundamental metrics"], available: false };
  }

  const score = clamp0to100((totalPoints / maxPoints) * 100);
  return { key: "fundamentals", label: "Fundamentals", score, weight: SCORING_WEIGHTS.fundamentals, evidence, available: true };
}

// 5. SENTIMENT PILLAR (0-100)
function computeSentimentPillar(newsArticles?: DecisionInput["newsArticles"]): PillarScore {
  if (!newsArticles || newsArticles.length === 0) {
    return { key: "sentiment", label: "News Sentiment", score: 50, weight: SCORING_WEIGHTS.sentiment, evidence: ["No recent news headlines found"], available: false };
  }

  const posCount = newsArticles.filter(a => a.sentiment === "POSITIVE").length;
  const negCount = newsArticles.filter(a => a.sentiment === "NEGATIVE").length;
  const total = newsArticles.length;

  const score = clamp0to100(50 + ((posCount - negCount) / total) * 40);
  const label =
    score >= 70 ? "News sentiment leans strongly positive" :
    score >= 58 ? "News sentiment leans positive" :
    score <= 30 ? "News sentiment leans strongly negative" :
    score <= 42 ? "News sentiment leans negative" :
    "News sentiment is mixed / neutral";
  const evidence = [
    label,
    `News sentiment breakdown: ${posCount} positive, ${total - posCount - negCount} neutral, ${negCount} negative out of ${total} articles`,
  ];

  return { key: "sentiment", label: "News Sentiment", score, weight: SCORING_WEIGHTS.sentiment, evidence, available: true };
}

// 6. STOCK RISK PILLAR (0-100) — IMPORTANT: 100 = LOW RISK / FAVORABLE, 0 = VERY HIGH RISK
function computeStockRiskPillar(volatility30d: number | null, fundamentals: FundamentalsData | null): PillarScore {
  const evidence: string[] = [];
  let score = 50;
  let availableCount = 0;

  if (volatility30d != null) {
    availableCount++;
    evidence.push(`30-day annualized volatility: ${volatility30d.toFixed(1)}%`);
    if (volatility30d < 25) score += 25;
    else if (volatility30d < 40) score += 5;
    else if (volatility30d < 60) score -= 15;
    else score -= 30;
  }

  if (fundamentals?.beta != null) {
    availableCount++;
    const beta = fundamentals.beta;
    evidence.push(`Stock beta: ${beta.toFixed(2)}`);
    if (beta <= 0.8) score += 20;
    else if (beta <= 1.2) score += 10;
    else if (beta <= 1.8) score -= 10;
    else score -= 25;
  }

  if (fundamentals?.debtToEquity != null) {
    availableCount++;
    if (fundamentals.debtToEquity < 0.5) score += 10;
    else if (fundamentals.debtToEquity > 2.0) score -= 20;
  }

  if (availableCount === 0) {
    return { key: "risk", label: "Stock Risk", score: 50, weight: SCORING_WEIGHTS.risk, evidence: ["Risk metrics (volatility, beta, debt) unavailable"], available: false };
  }

  const finalScore = clamp0to100(score);
  evidence.unshift(finalScore >= 70 ? "Stock risk profile is LOW / favorable" : finalScore >= 45 ? "Stock risk profile is MODERATE" : "Stock risk profile is HIGH / unfavorable");

  return { key: "risk", label: "Stock Risk", score: finalScore, weight: SCORING_WEIGHTS.risk, evidence, available: true };
}

// 7. MARKET + SECTOR PILLAR (0-100)
function computeMarketSectorPillar(marketRiskScore: number | null, sectorChangePct: number | null): PillarScore {
  const evidence: string[] = [];
  let marketScore = 50;
  let sectorScore = 50;

  if (marketRiskScore != null) {
    marketScore = clamp0to100(100 - marketRiskScore);
    evidence.push(`Market risk score is ${marketRiskScore}/100 (${marketRiskScore < 40 ? "favorable market" : marketRiskScore > 70 ? "high market risk" : "neutral market"})`);
  } else {
    evidence.push("Broad market risk score unavailable");
  }

  if (sectorChangePct != null) {
    sectorScore = clamp0to100(50 + sectorChangePct * 15);
    evidence.push(`Sector index performance: ${sectorChangePct >= 0 ? "+" : ""}${sectorChangePct.toFixed(2)}% today`);
  } else {
    evidence.push("Sector index data unavailable");
  }

  const combined = clamp0to100(0.6 * marketScore + 0.4 * sectorScore);
  return { key: "marketSector", label: "Market & Sector", score: combined, weight: SCORING_WEIGHTS.marketSector, evidence, available: true };
}

// Ties the pillar breakdown into one plain-English sentence — the thing
// reasons[] (a flat bullet list) can't say on its own: not just *what* each
// pillar shows, but *why those add up* to this specific signal. A user
// reading 6 disconnected facts still has to do this synthesis themselves;
// this does it for them.
function buildSynthesis(
  signal: SignalAction,
  usable: PillarScore[],
  mainRisk: string,
  overrideWarning: string | undefined,
  dataQualityLabel: DecisionResult["dataQuality"]
): string {
  if (overrideWarning) {
    // A rule fired (insufficient data, elevated market risk, or a downtrend)
    // and capped what would otherwise have been a BUY — say so plainly,
    // since this is exactly the case where reasons[] alone looks
    // contradictory (bullish-sounding bullets next to a WAIT verdict).
    return overrideWarning.replace(/^BUY signal overridden to WAIT/, "This would otherwise be a BUY, but is held to WAIT");
  }

  if (dataQualityLabel === "INSUFFICIENT") {
    return "There isn't enough reliable data yet to generate a confident call — treat this as a placeholder, not a recommendation.";
  }

  const bullish = [...usable].filter((p) => p.score >= 60).sort((a, b) => b.score - a.score);
  const bearish = [...usable].filter((p) => p.score <= 40).sort((a, b) => a.score - b.score);
  const lead = (pillars: PillarScore[]) => pillars.slice(0, 2).map((p) => p.label).join(" and ");

  if (signal === "STRONG BUY" || signal === "BUY") {
    const support = lead(bullish);
    const caveat = bearish.length > 0 ? `, though ${lead(bearish)} ${bearish.length === 1 ? "is" : "are"} still a drag` : "";
    return support
      ? `Rated ${signal} because ${support} ${bullish.length === 1 ? "looks" : "look"} favorable${caveat}.`
      : `Rated ${signal} on balance, though no single factor stands out strongly.`;
  }

  if (signal === "SELL" || signal === "STRONG SELL" || signal === "REDUCE") {
    const drag = lead(bearish);
    const caveat = bullish.length > 0 ? `, despite ${lead(bullish)} looking favorable` : "";
    return drag
      ? `Rated ${signal} because ${drag} ${bearish.length === 1 ? "is" : "are"} working against the stock${caveat}.`
      : `Rated ${signal} on balance${caveat}, though nothing looks decisively negative — ${mainRisk.charAt(0).toLowerCase()}${mainRisk.slice(1)}`;
  }

  if (signal === "HOLD") {
    return bullish.length > 0 && bearish.length > 0
      ? `Rated HOLD — ${lead(bullish)} ${bullish.length === 1 ? "looks" : "look"} favorable while ${lead(bearish)} ${bearish.length === 1 ? "pulls" : "pull"} the other way, with no clear edge either side.`
      : "Rated HOLD — factors are balanced, with no single pillar strong enough to justify a bigger move.";
  }

  // WAIT with no specific override matched above (falls through to the
  // generic "insufficient data" framing already handled) — kept for
  // exhaustiveness in case future signal values are added.
  return `Rated ${signal} — ${mainRisk.charAt(0).toLowerCase()}${mainRisk.slice(1)}`;
}

export function computeDecision(input: DecisionInput): DecisionResult {
  const trend = computeTrendPillar(input.indicators, input.priceChangePct);
  const momentum = computeMomentumPillar(input.indicators);
  const volume = computeVolumePillar(input.indicators, input.volume, input.avgVolume, input.priceChangePct);
  const fundamentals = computeFundamentalsPillar(input.fundamentals);
  const sentiment = computeSentimentPillar(input.newsArticles);
  const risk = computeStockRiskPillar(input.volatility30d, input.fundamentals);
  const marketSector = computeMarketSectorPillar(input.marketRiskScore, input.sectorChangePct);

  const pillars = [trend, momentum, volume, fundamentals, sentiment, risk, marketSector];

  const usable = pillars.filter(p => p.available);

  // Data Quality Assessment
  let dataQualityScore = 100;
  const warnings: string[] = [];

  if (!input.indicators) {
    dataQualityScore -= 30;
    warnings.push("Technical indicators history missing or incomplete.");
  }
  if (!input.fundamentals) {
    dataQualityScore -= 20;
    warnings.push("Fundamental financial data missing.");
  }
  if (input.candlesCount != null && input.candlesCount < 30) {
    dataQualityScore -= 40;
    warnings.push("Insufficient price candle history (<30 days).");
  }
  if (!input.newsArticles || input.newsArticles.length === 0) {
    dataQualityScore -= 10;
  }

  let dataQualityLabel: DecisionResult["dataQuality"] = "GOOD";
  if (dataQualityScore >= 85) dataQualityLabel = "EXCELLENT";
  else if (dataQualityScore >= 70) dataQualityLabel = "GOOD";
  else if (dataQualityScore >= 50) dataQualityLabel = "MODERATE";
  else if (dataQualityScore >= 30) dataQualityLabel = "POOR";
  else dataQualityLabel = "INSUFFICIENT";

  // Penalise further when fundamentals are missing — a 20%-weight pillar
  // silently defaulting to 50 is the same as treating "no data" as neutral,
  // which inflates BUY scores on stocks we have no financial visibility into.
  if (!input.fundamentals) {
    dataQualityScore = Math.max(0, dataQualityScore - 15);
    if (dataQualityScore < 50) dataQualityLabel = "POOR";
  }

  // Compute final score formula
  const finalScoreRaw =
    trend.score * SCORING_WEIGHTS.trend +
    momentum.score * SCORING_WEIGHTS.momentum +
    volume.score * SCORING_WEIGHTS.volume +
    fundamentals.score * SCORING_WEIGHTS.fundamentals +
    sentiment.score * SCORING_WEIGHTS.sentiment +
    risk.score * SCORING_WEIGHTS.risk +
    marketSector.score * SCORING_WEIGHTS.marketSector;

  const finalScoreClamped = Math.max(0, Math.min(100, finalScoreRaw));
  const finalScore = Number(finalScoreClamped.toFixed(2));

  const scores: DecisionScores = {
    trend: trend.score,
    momentum: momentum.score,
    volume: volume.score,
    fundamentals: fundamentals.score,
    sentiment: sentiment.score,
    risk: risk.score,
    marketSector: marketSector.score,
    final: finalScore,
  };

  // Signal Classification (0-100) using exact boundaries without premature rounding
  let signal: SignalAction = classifySignal(finalScoreClamped);

  // Safety Overrides & Validation Rules
  const reasons: string[] = [];

  // Add top positive & negative reasons from pillars
  usable.forEach(p => {
    if (p.evidence.length > 0) {
      reasons.push(p.evidence[0]);
    }
  });

  // Rule A: Insufficient Data Quality / < 60 trading candles -> WAIT
  // SMA50 needs 50 days, ATR14 needs 14, MACD needs 35+. 60 is the safe floor.
  const hasInsufficientCandles = input.candlesCount != null && input.candlesCount < 60;
  if (dataQualityLabel === "INSUFFICIENT" || hasInsufficientCandles) {
    signal = "WAIT";
    reasons.unshift("Data coverage is insufficient to generate a reliable signal (<60 trading days)");
  }

  // Rule D: Missing fundamental data — cap BUY/STRONG BUY at HOLD
  // Fundamentals carry 20% of the score. When unavailable, the pillar silently
  // scores 50 (neutral), which can push genuinely risky stocks into BUY territory.
  // Without financial visibility into a business, the best we can responsibly say is HOLD.
  if ((signal === "BUY" || signal === "STRONG BUY") && !input.fundamentals) {
    signal = "HOLD";
    warnings.push("BUY signal capped at HOLD — fundamental financial data (ROE, revenue, D/E) is unavailable for this stock.");
    reasons.unshift("Fundamental data missing: cannot confirm business quality before issuing a BUY");
  }

  // Rule B: Elevated Market Risk (>=75) overrides BUY to WAIT
  if ((signal === "BUY" || signal === "STRONG BUY") && input.marketRiskScore != null && input.marketRiskScore >= 75) {
    signal = "WAIT";
    warnings.push("BUY signal overridden to WAIT due to elevated broad market volatility (Market Risk >= 75)");
    reasons.unshift("Elevated market risk overrides BUY signal into WAIT");
  }

  // Rule C: Technical Downtrend (SMA20 < SMA50 or DOWNTREND) overrides BUY to WAIT
  const isDowntrend =
    (input.indicators?.sma20 != null && input.indicators?.sma50 != null && input.indicators.sma20 < input.indicators.sma50) ||
    input.indicators?.trend === "DOWNTREND";
  if ((signal === "BUY" || signal === "STRONG BUY") && isDowntrend) {
    signal = "WAIT";
    warnings.push("BUY signal overridden to WAIT because technical price trend is in a downtrend (SMA20 < SMA50)");
    reasons.unshift("Downtrend setup (SMA20 < SMA50) caps action to WAIT to avoid catching falling price momentum");
  }

  // Rule E: Stock hit circuit today — can't trade; set to WAIT
  // A circuit breaker means the exchange has halted trading or orders cannot
  // be matched at any price. The signal is meaningless until trading resumes.
  if (input.circuitHit) {
    signal = "WAIT";
    warnings.push("Stock hit an upper/lower circuit today — trading is halted at this price. Signal suspended until normal trading resumes.");
    reasons.unshift("Circuit breaker triggered today: no actionable trade possible at current price");
  }

  // Rule F: Negative regulatory/legal announcement detected in news
  // SEBI notice, fraud probe, auditor resignation — any of these can crater a
  // stock overnight. No algorithm's technicals should override this.
  if (input.negativeAnnouncement && !input.circuitHit) {
    const kw = input.negativeKeyword ?? "regulatory/legal issue";
    if (signal === "BUY" || signal === "STRONG BUY" || signal === "HOLD") {
      signal = "WAIT";
      warnings.push(`⚠️ Negative news detected ("${kw}") — BUY/HOLD signal suspended pending clarification. Verify the news before acting.`);
      reasons.unshift(`Regulatory/legal headline detected: "${kw}" — technical signal overridden to WAIT`);
    } else {
      // Already SELL/REDUCE — keep the signal but add a strong warning
      warnings.push(`⚠️ Negative news detected ("${kw}") — confirms the bearish signal. Exit quickly if holding.`);
      reasons.unshift(`Bearish signal reinforced by negative headline: "${kw}"`);
    }
  }

  // Rule G: Bulk sell by promoter / FII today → reduce score, add warning
  // If the people who know the company best are dumping, that's information the
  // score alone doesn't capture. We don't force WAIT (it may be a planned sale)
  // but we reduce the final score by 10 points and flag it prominently.
  if (input.bulkSellAlert && !input.negativeAnnouncement && !input.circuitHit) {
    warnings.push("Promoter/FII bulk-sell deal detected in NSE bulk/block data today — large insider selling is a yellow flag even if technicals look bullish.");
    reasons.push("Large insider/institutional selling detected today via NSE bulk deal data");
    // Downgrade signal one notch if it's a BUY
    if (signal === "STRONG BUY") {
      signal = "BUY";
      warnings.push("STRONG BUY downgraded to BUY due to bulk sell alert.");
    } else if (signal === "BUY") {
      signal = "HOLD";
      warnings.push("BUY downgraded to HOLD due to bulk sell alert — wait for selling pressure to subside.");
    }
  }

  // Rule H: Suspected pump-and-dump (small cap + extreme volume spike)
  // Small caps with <₹2000cr market cap and volume >5× 20-day average with no
  // earnings/news catalyst are the classic pump pattern. WAIT until volume
  // normalises — entering a pump is far more likely to be a loss than a win.
  if (input.suspectedPump && !input.circuitHit) {
    signal = "WAIT";
    const capNote = input.marketCapCrore
      ? ` (market cap ₹${input.marketCapCrore.toFixed(0)} cr)`
      : "";
    warnings.push(`⚠️ Suspected pump-and-dump: small-cap stock${capNote} with volume spike >5× its 20-day average and no known catalyst. High risk of sharp reversal.`);
    reasons.unshift("Volume spike in small cap with no catalyst — suspected pump activity; WAIT for volume to normalise");
  }

  // Confidence Calculation (0-100): 60% agreementFactor + 40% dataQualityScore
  const scoreDeviations = usable.map(p => Math.abs(p.score - finalScore));
  const avgDeviation = scoreDeviations.length > 0 ? scoreDeviations.reduce((a, b) => a + b, 0) / scoreDeviations.length : 25;
  const agreementFactor = clamp0to100(Math.max(0, 100 - avgDeviation * 1.8));
  const confidence = clamp0to100(0.60 * agreementFactor + 0.40 * dataQualityScore);

  // Main Risk summary
  const lowestPillar = [...usable].sort((a, b) => a.score - b.score)[0];
  const mainRisk = lowestPillar && lowestPillar.score < 45
    ? `${lowestPillar.label} is the primary drag (${lowestPillar.score}/100): ${lowestPillar.evidence[0]}`
    : input.marketRiskScore != null && input.marketRiskScore >= 60
    ? `Broad market risk is elevated (${input.marketRiskScore}/100)`
    : "No major isolated risk identified in current data";

  const wouldChange: string[] = [];
  if (signal === "WAIT") wouldChange.push("Sufficient historical candle data becoming available");
  if (signal === "WAIT" && input.marketRiskScore != null && input.marketRiskScore >= 75) wouldChange.push("Broad market volatility cooling down below 75");
  if (signal === "BUY" || signal === "STRONG BUY") wouldChange.push("Deterioration in fundamental growth metrics or trend breakdown below SMA50");
  if (signal === "REDUCE" || signal === "SELL" || signal === "STRONG SELL") wouldChange.push("Trend reversal above EMA20 with volume confirmation or earnings recovery");
  if (wouldChange.length === 0) wouldChange.push("Material shift in technical momentum or fundamental ratios");

  // Only Rule B/C actually "override" a call (they say so explicitly); the
  // data-quality warnings pushed earlier are generic and shouldn't be
  // mistaken for one, or a merely-incomplete-data case would get narrated
  // as if a rule had overridden a BUY.
  const overrideWarning = warnings.find((w) => w.includes("overridden"));
  const synthesis = buildSynthesis(signal, usable, mainRisk, overrideWarning, dataQualityLabel);

  return {
    symbol: input.symbol,
    signal,
    confidence,
    scores,
    pillars,
    reasons: reasons.slice(0, 5),
    warnings: warnings.slice(0, 4),
    mainRisk,
    wouldChange,
    synthesis,
    dataQuality: dataQualityLabel,
    dataQualityScore,
    horizon: computeSignalHorizon(pillars, signal),
  };
}
