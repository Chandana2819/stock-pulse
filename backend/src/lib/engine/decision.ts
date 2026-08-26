// Explainable decision engine.
//
// Combines fundamentals + valuation + technicals + market conditions + sector
// conditions + news sentiment + volatility + liquidity + portfolio exposure +
// user risk profile + horizon into one of BUY / HOLD / WAIT / REDUCE / AVOID /
// WATCH. Every score is a named "pillar" with its own evidence, so the final
// call is never a black box, and the engine is allowed to conclude "do
// nothing" when nothing clearly supports action.

import type { FundamentalsData } from "../providers/types";
import type { IndicatorSnapshot } from "../indicators";

export type Decision = "BUY" | "HOLD" | "WAIT" | "REDUCE" | "AVOID" | "WATCH";

export type PillarScore = {
  key: string;
  label: string;
  score: number; // -100 (very bearish) .. +100 (very bullish)
  weight: number;
  evidence: string[];
  available: boolean;
};

export type DecisionResult = {
  decision: Decision;
  confidence: number; // 0-100
  totalScore: number; // -100..100
  pillars: PillarScore[];
  reasons: string[];
  mainRisk: string;
  wouldChange: string[];
};

export type DecisionInput = {
  fundamentals: FundamentalsData | null;
  indicators: IndicatorSnapshot | null;
  priceChangePct: number | null;
  marketRiskScore: number | null; // 0-100, higher = riskier
  sectorChangePct: number | null;
  newsSentimentScore: number | null; // -1..1
  volatility30d: number | null;
  avgVolume: number | null;
  volume: number | null;
  ownedQuantity: number;
  portfolioWeightPct: number | null; // this stock's % of the user's portfolio, if held
  riskTolerance: "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE";
  horizonYears: number;
};

function clampScore(n: number) {
  return Math.round(Math.max(-100, Math.min(100, n)));
}

function fundamentalsPillar(f: FundamentalsData | null): PillarScore {
  if (!f) return { key: "fundamentals", label: "Fundamentals", score: 0, weight: 0.22, evidence: ["No fundamentals data available"], available: false };
  const evidence: string[] = [];
  let score = 0;
  let signals = 0;

  if (f.roe != null) {
    signals++;
    score += f.roe >= 20 ? 25 : f.roe >= 12 ? 12 : f.roe >= 5 ? 0 : -20;
    evidence.push(`ROE ${f.roe.toFixed(1)}%`);
  }
  if (f.revenueGrowth != null) {
    signals++;
    score += f.revenueGrowth >= 15 ? 20 : f.revenueGrowth >= 5 ? 8 : f.revenueGrowth >= 0 ? -3 : -20;
    evidence.push(`Revenue growth ${f.revenueGrowth.toFixed(1)}%`);
  }
  if (f.profitGrowth != null) {
    signals++;
    score += f.profitGrowth >= 15 ? 20 : f.profitGrowth >= 5 ? 8 : f.profitGrowth >= 0 ? -3 : -20;
    evidence.push(`Profit growth ${f.profitGrowth.toFixed(1)}%`);
  }
  if (f.debtToEquity != null) {
    signals++;
    score += f.debtToEquity <= 0.3 ? 15 : f.debtToEquity <= 1 ? 5 : f.debtToEquity <= 2 ? -10 : -25;
    evidence.push(`Debt/Equity ${f.debtToEquity.toFixed(2)}`);
  }
  if (f.freeCashFlow != null) {
    signals++;
    score += f.freeCashFlow > 0 ? 10 : -15;
    evidence.push(f.freeCashFlow > 0 ? "Positive free cash flow" : "Negative free cash flow");
  }

  if (signals === 0) return { key: "fundamentals", label: "Fundamentals", score: 0, weight: 0.22, evidence: ["Insufficient fundamentals coverage"], available: false };
  return { key: "fundamentals", label: "Fundamentals", score: clampScore(score), weight: 0.22, evidence, available: true };
}

function valuationPillar(f: FundamentalsData | null): PillarScore {
  if (!f || f.peRatio == null) {
    return { key: "valuation", label: "Valuation", score: 0, weight: 0.18, evidence: ["PE ratio not available"], available: false };
  }
  const evidence = [`PE ${f.peRatio.toFixed(1)}`];
  let score = 0;
  if (f.peRatio <= 0) {
    score = -10;
    evidence.push("Negative/undefined earnings");
  } else if (f.peRatio < 12) {
    score = 25;
  } else if (f.peRatio < 22) {
    score = 10;
  } else if (f.peRatio < 35) {
    score = -10;
  } else {
    score = -30;
  }
  if (f.pbRatio != null) {
    evidence.push(`PB ${f.pbRatio.toFixed(1)}`);
    score += f.pbRatio < 3 ? 5 : f.pbRatio > 8 ? -10 : 0;
  }
  if (f.dividendYield != null && f.dividendYield > 1.5) {
    evidence.push(`Dividend yield ${f.dividendYield.toFixed(1)}%`);
    score += 5;
  }
  return { key: "valuation", label: "Valuation", score: clampScore(score), weight: 0.18, evidence, available: true };
}

function technicalPillar(ind: IndicatorSnapshot | null, priceChangePct: number | null): PillarScore {
  if (!ind) return { key: "technical", label: "Technical", score: 0, weight: 0.16, evidence: ["No chart data available"], available: false };
  const evidence: string[] = [];
  let score = 0;

  if (ind.trend === "UPTREND") { score += 20; evidence.push("Price above SMA20 and SMA20 above SMA50 (uptrend)"); }
  else if (ind.trend === "DOWNTREND") { score -= 20; evidence.push("Price below SMA20 and SMA20 below SMA50 (downtrend)"); }
  else if (ind.trend === "SIDEWAYS") { evidence.push("Price consolidating near its moving averages"); }

  if (ind.rsi14 != null) {
    evidence.push(`RSI(14) ${ind.rsi14.toFixed(0)}`);
    if (ind.rsi14 >= 75) score -= 20;
    else if (ind.rsi14 >= 60) score += 8;
    else if (ind.rsi14 <= 25) score -= 10; // deeply oversold reads as weak momentum, not a buy signal by itself
    else if (ind.rsi14 <= 40) score -= 5;
  }

  if (ind.macd.histogram != null) {
    score += ind.macd.histogram > 0 ? 10 : -10;
    evidence.push(`MACD histogram ${ind.macd.histogram > 0 ? "positive" : "negative"}`);
  }

  if (priceChangePct != null && Math.abs(priceChangePct) >= 5) {
    score += priceChangePct > 0 ? -8 : -5; // sharp one-day moves in either direction reduce near-term confidence
    evidence.push(`Sharp ${priceChangePct > 0 ? "rally" : "drop"} of ${Math.abs(priceChangePct).toFixed(1)}% today`);
  }

  return { key: "technical", label: "Technical", score: clampScore(score), weight: 0.16, evidence, available: true };
}

function marketPillar(marketRiskScore: number | null): PillarScore {
  if (marketRiskScore == null) return { key: "market", label: "Market Conditions", score: 0, weight: 0.12, evidence: ["Market risk data unavailable"], available: false };
  const score = clampScore(50 - marketRiskScore); // risk 0 -> +50, risk 100 -> -50
  return {
    key: "market",
    label: "Market Conditions",
    score,
    weight: 0.12,
    evidence: [`Market Risk Radar at ${marketRiskScore}/100`],
    available: true,
  };
}

function sectorPillar(sectorChangePct: number | null): PillarScore {
  if (sectorChangePct == null) return { key: "sector", label: "Sector Conditions", score: 0, weight: 0.08, evidence: ["Sector index unavailable"], available: false };
  return {
    key: "sector",
    label: "Sector Conditions",
    score: clampScore(sectorChangePct * 10),
    weight: 0.08,
    evidence: [`Sector index ${sectorChangePct >= 0 ? "+" : ""}${sectorChangePct.toFixed(2)}% today`],
    available: true,
  };
}

function newsPillar(sentiment: number | null): PillarScore {
  if (sentiment == null) return { key: "news", label: "News Sentiment", score: 0, weight: 0.08, evidence: ["No recent relevant headlines"], available: false };
  return {
    key: "news",
    label: "News Sentiment",
    score: clampScore(sentiment * 60),
    weight: 0.08,
    evidence: [`Aggregate recent-news sentiment: ${sentiment > 0.1 ? "positive" : sentiment < -0.1 ? "negative" : "neutral"}`],
    available: true,
  };
}

function volatilityLiquidityPillar(volatility30d: number | null, volume: number | null, avgVolume: number | null): PillarScore {
  const evidence: string[] = [];
  let score = 0;
  let signals = 0;
  if (volatility30d != null) {
    signals++;
    evidence.push(`30D annualised volatility ${volatility30d.toFixed(0)}%`);
    score += volatility30d > 60 ? -20 : volatility30d > 35 ? -8 : 5;
  }
  if (volume != null && avgVolume && avgVolume > 0) {
    signals++;
    const ratio = volume / avgVolume;
    evidence.push(`Volume ${ratio.toFixed(1)}x average`);
    if (ratio < 0.3) score -= 10; // illiquid
    else if (ratio > 3) score -= 5; // unusual spike adds uncertainty
  }
  if (signals === 0) return { key: "volLiquidity", label: "Volatility & Liquidity", score: 0, weight: 0.08, evidence: ["Insufficient data"], available: false };
  return { key: "volLiquidity", label: "Volatility & Liquidity", score: clampScore(score), weight: 0.08, evidence, available: true };
}

function exposurePillar(portfolioWeightPct: number | null, riskTolerance: DecisionInput["riskTolerance"]): PillarScore {
  if (portfolioWeightPct == null) return { key: "exposure", label: "Portfolio Exposure", score: 0, weight: 0.08, evidence: ["Not currently held"], available: true };
  const cap = riskTolerance === "CONSERVATIVE" ? 10 : riskTolerance === "MODERATE" ? 15 : 22;
  const evidence = [`Currently ${portfolioWeightPct.toFixed(1)}% of your simulated portfolio`];
  let score = 0;
  if (portfolioWeightPct > cap * 1.5) { score = -35; evidence.push(`Well above your ${cap}% concentration guideline for a ${riskTolerance.toLowerCase()} profile`); }
  else if (portfolioWeightPct > cap) { score = -15; evidence.push(`Above your ${cap}% concentration guideline`); }
  return { key: "exposure", label: "Portfolio Exposure", score, weight: 0.08, evidence, available: true };
}

export function computeDecision(input: DecisionInput): DecisionResult {
  const pillars = [
    fundamentalsPillar(input.fundamentals),
    valuationPillar(input.fundamentals),
    technicalPillar(input.indicators, input.priceChangePct),
    marketPillar(input.marketRiskScore),
    sectorPillar(input.sectorChangePct),
    newsPillar(input.newsSentimentScore),
    volatilityLiquidityPillar(input.volatility30d, input.volume, input.avgVolume),
    exposurePillar(input.portfolioWeightPct, input.riskTolerance),
  ];

  const usable = pillars.filter((p) => p.available);
  const totalWeight = usable.reduce((a, p) => a + p.weight, 0);
  const totalScore = totalWeight > 0 ? Math.round(usable.reduce((a, p) => a + p.score * p.weight, 0) / totalWeight) : 0;

  const dataCompleteness = usable.length / pillars.length;
  // Confidence blends how decisive the score is with how much evidence backed it.
  const confidence = Math.round(Math.min(95, Math.max(30, Math.abs(totalScore) * 0.6 + dataCompleteness * 40)));

  const horizonBoost = input.horizonYears >= 5 ? 5 : input.horizonYears <= 1 ? -5 : 0;
  const adjusted = clampScore(totalScore + horizonBoost);

  let decision: Decision;
  const overExposed = pillars.find((p) => p.key === "exposure")!.score <= -30;
  const risky = input.marketRiskScore != null && input.marketRiskScore >= 70;

  if (input.ownedQuantity > 0 && overExposed) decision = "REDUCE";
  else if (adjusted >= 45 && !risky) decision = "BUY";
  else if (adjusted >= 45 && risky) decision = "WAIT";
  else if (adjusted <= -45) decision = "AVOID";
  else if (adjusted <= -20) decision = input.ownedQuantity > 0 ? "REDUCE" : "AVOID";
  else if (adjusted >= 15) decision = "WATCH";
  else decision = "HOLD";

  const reasons = [...usable]
    .sort((a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight))
    .slice(0, 4)
    .map((p) => `${p.label}: ${p.evidence[0]}`);

  const worstPillar = [...usable].sort((a, b) => a.score - b.score)[0];
  const mainRisk = worstPillar && worstPillar.score < 0
    ? `${worstPillar.label} is the biggest drag: ${worstPillar.evidence[0]}`
    : risky
    ? "Overall market risk is elevated, which can override otherwise-strong signals"
    : "No single dominant risk identified in the available data";

  const wouldChange: string[] = [];
  if (decision === "WAIT") wouldChange.push("Market Risk Radar cooling to a lower band");
  if (decision === "AVOID" || decision === "REDUCE") wouldChange.push("Valuation compressing or fundamentals improving");
  if (decision === "BUY" || decision === "WATCH") wouldChange.push("A clear deterioration in fundamentals or a spike in market risk");
  if (!input.fundamentals) wouldChange.push("Fundamentals data becoming available for this symbol");
  if (wouldChange.length === 0) wouldChange.push("A material change in any of the pillars above");

  return { decision, confidence, totalScore: adjusted, pillars, reasons, mainRisk, wouldChange };
}
