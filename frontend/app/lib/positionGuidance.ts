// Translates a REDUCE/SELL/STRONG SELL signal into a concrete "how much of
// the position to trim" suggestion. The decision engine only ever outputs a
// qualitative band (backend/src/lib/engine/decision.ts) — it has no portfolio
// context, so sizing has to happen here, where we know the holding.

export type PositionGuidance = {
  label: string;
  pct: number;
  note: string;
};

const REDUCE_BAND_MIN = 45;
const REDUCE_BAND_MAX = 54;

export function getPositionGuidance(
  action: string,
  score: number,
  portfolioWeightPct?: number | null
): PositionGuidance | null {
  const a = (action || "").toUpperCase();

  if (a === "SELL" || a === "STRONG SELL") {
    return {
      label: "Exit Position",
      pct: 100,
      note:
        a === "STRONG SELL"
          ? "Score is deep in sell territory — the model sees no case for holding any of this position."
          : "Score has broken below the REDUCE band — the model no longer sees a case for holding this position.",
    };
  }

  if (a === "REDUCE") {
    const clamped = Math.min(REDUCE_BAND_MAX, Math.max(REDUCE_BAND_MIN, score));
    const depthIntoband = (REDUCE_BAND_MAX - clamped) / (REDUCE_BAND_MAX - REDUCE_BAND_MIN); // 0 at score=54, 1 at score=45
    let pct = 25 + depthIntoband * 25; // 25%..50% baseline

    const concentrated = portfolioWeightPct != null && portfolioWeightPct > 25;
    if (concentrated) pct += 10; // trim more if this single position dominates the portfolio

    pct = Math.min(75, Math.round(pct / 5) * 5); // round to nearest 5%, cap at 75%

    return {
      label: "Suggested Trim",
      pct,
      note: concentrated
        ? `Score is ${score}/100 (mid-REDUCE band) and this position is concentrated (${portfolioWeightPct!.toFixed(0)}% of portfolio) — trim more than the score alone would suggest to reduce concentration risk.`
        : `Score is ${score}/100 — closer to ${clamped <= 49 ? "SELL" : "HOLD"}, so trim ${clamped <= 49 ? "more" : "less"} of the position. Not a full exit.`,
    };
  }

  return null;
}
