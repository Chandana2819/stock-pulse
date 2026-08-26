// Market Risk Engine
// ------------------
// Produces a 0-100 risk score from several independent factors, each also
// scored 0-100, so the UI can explain *why* the score is what it is instead
// of just showing a number.
//
// IMPORTANT: two factors from the original spec — market breadth
// (advance/decline) and per-sector performance — need a paid/licensed data
// feed we don't have yet (Yahoo's free chart endpoint doesn't expose them).
// Rather than fabricate numbers, those factors are marked `available: false`
// and excluded from the weighted average (weights are renormalized across
// the factors we *can* actually compute). Wire in a real breadth/sector
// provider later and flip `available: true`.

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

// Configurable in one place, per the spec.
export const RISK_WEIGHTS = {
  indexTrend: 0.30,
  volatility: 0.25,
  globalMarkets: 0.20,
  largeCapDivergence: 0.15, // proxy for "sector weakness" until real sector data exists
  breadth: 0.10, // currently unavailable — see note above
};

function classify(score: number): { classification: MarketRiskResult["classification"]; emoji: MarketRiskResult["statusEmoji"] } {
  if (score <= 20) return { classification: "VERY LOW RISK", emoji: "🟢" };
  if (score <= 40) return { classification: "LOW RISK", emoji: "🟢" };
  if (score <= 60) return { classification: "MODERATE", emoji: "🟡" };
  if (score <= 80) return { classification: "HIGH", emoji: "🟠" };
  return { classification: "VERY HIGH", emoji: "🔴" };
}

/** Maps a % change (negative = falling) to a 0-100 risk contribution. */
function pctChangeToRisk(pctChange: number, sensitivity = 1): number {
  // -3% or worse -> 100 risk; 0% -> 50; +3% or better -> 0
  const scaled = 50 - (pctChange / (3 / sensitivity)) * 50;
  return Math.max(0, Math.min(100, scaled));
}

/** Maps India VIX level to 0-100 risk. Historical "calm" ~11-14, "elevated" ~20+. */
function vixToRisk(vix: number): number {
  if (vix <= 12) return 10;
  if (vix >= 30) return 100;
  return ((vix - 12) / (30 - 12)) * 90 + 10;
}

export type IndexChange = { key: string; label: string; pctChange: number | null };

export function computeMarketRisk(input: {
  niftyChange: number | null;
  sensexChange: number | null;
  bankNiftyChange: number | null;
  indiaVix: number | null;
  spxChange: number | null;
  nasdaqChange: number | null;
  dowChange: number | null;
}): MarketRiskResult {
  const factors: RiskFactor[] = [];

  // 1. Index trend — average of NIFTY/SENSEX % change
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

  // 2. Volatility — India VIX
  if (input.indiaVix != null) {
    const score = vixToRisk(input.indiaVix);
    factors.push({
      key: "volatility",
      label: "Volatility",
      score,
      weight: RISK_WEIGHTS.volatility,
      available: true,
      detail: `India VIX at ${input.indiaVix.toFixed(2)}`,
    });
  } else {
    factors.push({ key: "volatility", label: "Volatility", score: null, weight: RISK_WEIGHTS.volatility, available: false, detail: "India VIX unavailable" });
  }

  // 3. Global markets
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

  // 4. Large-cap divergence (Bank Nifty vs Nifty) — proxy for sector stress
  if (input.bankNiftyChange != null && input.niftyChange != null) {
    const divergence = Math.abs(input.bankNiftyChange - input.niftyChange);
    const score = Math.max(0, Math.min(100, (divergence / 2) * 100));
    factors.push({
      key: "largeCapDivergence",
      label: "Sector Divergence (proxy)",
      score,
      weight: RISK_WEIGHTS.largeCapDivergence,
      available: true,
      detail: `Bank Nifty vs NIFTY diverging by ${divergence.toFixed(2)} pts — proxy only, not full sector breadth`,
    });
  } else {
    factors.push({ key: "largeCapDivergence", label: "Sector Divergence (proxy)", score: null, weight: RISK_WEIGHTS.largeCapDivergence, available: false, detail: "Bank Nifty data unavailable" });
  }

  // 5. Breadth — not available without a licensed feed
  factors.push({
    key: "breadth",
    label: "Market Breadth",
    score: null,
    weight: RISK_WEIGHTS.breadth,
    available: false,
    detail: "Requires an advance/decline data feed — not yet integrated",
  });

  const usable = factors.filter((f) => f.available && f.score != null);
  const totalWeight = usable.reduce((sum, f) => sum + f.weight, 0);
  const score = totalWeight > 0
    ? Math.round(usable.reduce((sum, f) => sum + f.score! * f.weight, 0) / totalWeight)
    : 50; // neutral fallback if literally nothing is available

  const { classification, emoji } = classify(score);

  const reasons: string[] = [];
  if (input.niftyChange != null && input.niftyChange < -0.5) reasons.push("NIFTY declining");
  if (input.indiaVix != null && input.indiaVix > 16) reasons.push("Volatility elevated");
  if (input.bankNiftyChange != null && input.niftyChange != null && Math.abs(input.bankNiftyChange - input.niftyChange) > 1) {
    reasons.push("Banking sector diverging sharply from the broader index");
  }
  const globalAvg = globalChanges.length > 0 ? globalChanges.reduce((a, b) => a + b, 0) / globalChanges.length : null;
  if (globalAvg != null && globalAvg < -0.5) reasons.push("Global markets weak, adding pressure");
  if (reasons.length === 0) reasons.push("No major stress signals detected in the available data");

  return { score, classification, statusEmoji: emoji, factors, reasons };
}
