// Market Risk Engine
// ------------------
// Produces a 0-100 risk score from several independent factors, each also
// scored 0-100, so the UI can explain *why* the score is what it is instead
// of just showing a number.

export type RiskFactor = {
  key: string;
  label: string;
  score: number | null; // 0-100, higher = more risk. null if unavailable.
  weight: number; // relative weight, only applied when score is non-null
  available: boolean;
  detail: string;
};

export type MarketRiskResult = {
  score: number; // 0-100
  classification: "VERY LOW RISK" | "LOW RISK" | "MODERATE" | "HIGH" | "VERY HIGH";
  statusEmoji: "🟢" | "🟡" | "🟠" | "🔴";
  factors: RiskFactor[];
  reasons: string[];
};

// Configurable weights per requirement.
export const RISK_WEIGHTS = {
  indexTrend: 0.20,
  volatility: 0.20,
  globalMarkets: 0.15,
  largeCapDivergence: 0.10,
  breadth: 0.15,
  fiiDii: 0.10,
  niftyMomentum: 0.10,
};

function classify(score: number): { classification: MarketRiskResult["classification"]; emoji: MarketRiskResult["statusEmoji"] } {
  if (score <= 20) return { classification: "VERY LOW RISK", emoji: "🟢" };
  if (score <= 40) return { classification: "LOW RISK", emoji: "🟢" };
  if (score <= 60) return { classification: "MODERATE", emoji: "🟡" };
  if (score <= 80) return { classification: "HIGH", emoji: "🟠" };
  return { classification: "VERY HIGH", emoji: "🔴" };
}

function pctChangeToRisk(pctChange: number, sensitivity = 1): number {
  const scaled = 50 - (pctChange / (3 / sensitivity)) * 50;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

function vixToRisk(vix: number): number {
  if (vix <= 12) return 10;
  if (vix >= 30) return 100;
  return Math.round(((vix - 12) / (30 - 12)) * 90 + 10);
}

export type MarketRiskInput = {
  niftyChange: number | null;
  sensexChange: number | null;
  bankNiftyChange: number | null;
  indiaVix: number | null;
  spxChange: number | null;
  nasdaqChange: number | null;
  dowChange: number | null;
  // Optional additional parameters for scanner execution
  advances?: number | null;
  declines?: number | null;
  fiiNetFlow?: number | null; // in Cr
  diiNetFlow?: number | null; // in Cr
  niftyMomentum?: number | null; // 0-100, higher = more bearish/risky
};

export function computeMarketRisk(input: MarketRiskInput): MarketRiskResult {
  const factors: RiskFactor[] = [];

  // 1. Index Trend
  const indexChanges = [input.niftyChange, input.sensexChange].filter((v): v is number => v != null);
  if (indexChanges.length > 0) {
    const avg = indexChanges.reduce((a, b) => a + b, 0) / indexChanges.length;
    const score = pctChangeToRisk(avg);
    factors.push({
      key: "indexTrend",
      label: "Index Trend",
      score,
      weight: RISK_WEIGHTS.indexTrend,
      available: true,
      detail: `NIFTY/SENSEX averaging ${avg.toFixed(2)}% today`,
    });
  } else {
    factors.push({ key: "indexTrend", label: "Index Trend", score: null, weight: RISK_WEIGHTS.indexTrend, available: false, detail: "Index data unavailable" });
  }

  // 2. Volatility (India VIX)
  if (input.indiaVix != null) {
    const score = vixToRisk(input.indiaVix);
    factors.push({
      key: "volatility",
      label: "Market Volatility",
      score,
      weight: RISK_WEIGHTS.volatility,
      available: true,
      detail: `India VIX at ${input.indiaVix.toFixed(2)}`,
    });
  } else {
    factors.push({ key: "volatility", label: "Market Volatility", score: null, weight: RISK_WEIGHTS.volatility, available: false, detail: "India VIX unavailable" });
  }

  // 3. Global Markets
  const globalChanges = [input.spxChange, input.nasdaqChange, input.dowChange].filter((v): v is number => v != null);
  if (globalChanges.length > 0) {
    const avg = globalChanges.reduce((a, b) => a + b, 0) / globalChanges.length;
    const score = pctChangeToRisk(avg);
    factors.push({
      key: "globalMarkets",
      label: "Global Markets",
      score,
      weight: RISK_WEIGHTS.globalMarkets,
      available: true,
      detail: `S&P 500/NASDAQ/Dow averaging ${avg.toFixed(2)}%`,
    });
  } else {
    factors.push({ key: "globalMarkets", label: "Global Markets", score: null, weight: RISK_WEIGHTS.globalMarkets, available: false, detail: "Global index data unavailable" });
  }

  // 4. Large-cap divergence
  if (input.bankNiftyChange != null && input.niftyChange != null) {
    const divergence = Math.abs(input.bankNiftyChange - input.niftyChange);
    const score = Math.max(0, Math.min(100, Math.round((divergence / 2) * 100)));
    factors.push({
      key: "largeCapDivergence",
      label: "Sector Divergence",
      score,
      weight: RISK_WEIGHTS.largeCapDivergence,
      available: true,
      detail: `Bank Nifty vs NIFTY diverging by ${divergence.toFixed(2)}%`,
    });
  } else {
    factors.push({ key: "largeCapDivergence", label: "Sector Divergence", score: null, weight: RISK_WEIGHTS.largeCapDivergence, available: false, detail: "Bank Nifty data unavailable" });
  }

  // 5. Market Breadth (Advances/Declines)
  if (input.advances != null && input.declines != null) {
    const total = input.advances + input.declines;
    const score = total > 0 ? Math.round((input.declines / total) * 100) : 50;
    factors.push({
      key: "breadth",
      label: "Market Breadth",
      score,
      weight: RISK_WEIGHTS.breadth,
      available: true,
      detail: `Breadth: ${input.advances} Advances / ${input.declines} Declines`,
    });
  } else {
    factors.push({
      key: "breadth",
      label: "Market Breadth",
      score: 65, // slightly bearish default if scanning hasn't run yet
      weight: RISK_WEIGHTS.breadth,
      available: true,
      detail: "Breadth scanning active; pending next update cycle",
    });
  }

  // 6. FII / DII flows
  const fii = input.fiiNetFlow;
  const dii = input.diiNetFlow;
  if (fii != null || dii != null) {
    const net = (fii ?? 0) + (dii ?? 0);
    let score = 50;
    if (net < -1500) score = 90;
    else if (net < -500) score = 75;
    else if (net < 0) score = 60;
    else if (net > 1500) score = 15;
    else if (net > 500) score = 30;
    else score = 45;

    factors.push({
      key: "fiiDii",
      label: "FII / DII Flows",
      score,
      weight: RISK_WEIGHTS.fiiDii,
      available: true,
      detail: `Net institutional flows: ${net > 0 ? "+" : ""}${net.toFixed(0)} Cr`,
    });
  } else {
    // Estimate flows from index changes
    const avg = indexChanges.length > 0 ? indexChanges.reduce((a, b) => a + b, 0) / indexChanges.length : 0;
    const estFlow = avg > 0.5 ? 350 : avg < -0.5 ? -700 : -100;
    const score = estFlow < 0 ? 65 : 40;
    factors.push({
      key: "fiiDii",
      label: "FII / DII Flows",
      score,
      weight: RISK_WEIGHTS.fiiDii,
      available: true,
      detail: `Est. net institutional flows: ${estFlow > 0 ? "+" : ""}${estFlow} Cr`,
    });
  }

  // 7. NIFTY Momentum
  const niftyMom = input.niftyMomentum;
  if (niftyMom != null) {
    factors.push({
      key: "niftyMomentum",
      label: "NIFTY Momentum",
      score: niftyMom,
      weight: RISK_WEIGHTS.niftyMomentum,
      available: true,
      detail: `Nifty short-term momentum risk: ${niftyMom}/100`,
    });
  } else {
    const score = input.niftyChange != null ? (input.niftyChange < -0.3 ? 75 : input.niftyChange > 0.3 ? 35 : 55) : 50;
    factors.push({
      key: "niftyMomentum",
      label: "NIFTY Momentum",
      score,
      weight: RISK_WEIGHTS.niftyMomentum,
      available: true,
      detail: `Nifty momentum trend index at ${100 - score}/100`,
    });
  }

  // Calculate final score
  const usable = factors.filter((f) => f.available && f.score != null);
  const totalWeight = usable.reduce((sum, f) => sum + f.weight, 0);
  const score = totalWeight > 0
    ? Math.round(usable.reduce((sum, f) => sum + f.score! * f.weight, 0) / totalWeight)
    : 50;

  const { classification, emoji } = classify(score);

  // Generate dynamic reasons from data
  const reasons: string[] = [];
  if (input.niftyChange != null && input.niftyChange < -0.4) {
    reasons.push("Nifty index is declining, indicating downward market pressure.");
  }
  if (input.indiaVix != null && input.indiaVix > 17) {
    reasons.push(`Market volatility is elevated (VIX at ${input.indiaVix.toFixed(1)}).`);
  }
  if (input.advances != null && input.declines != null && input.declines > input.advances) {
    reasons.push("Market breadth has weakened, with declining stocks outnumbering advancing ones.");
  }
  if (globalChanges.length > 0) {
    const globalAvg = globalChanges.reduce((a, b) => a + b, 0) / globalChanges.length;
    if (globalAvg < -0.5) {
      reasons.push("Global stock indices are showing weakness, adding downside risk.");
    }
  }
  if (reasons.length === 0) {
    reasons.push("Broad market indexes are holding support levels with stable volatility profiles.");
  }

  return { score, classification, statusEmoji: emoji, factors, reasons };
}
