// Characterizes how long a signal's underlying factors typically take to
// play out — NOT a price-move forecast. We never claim "this will drop by
// Friday"; that would be unfounded speculation dressed up as prediction.
// What we CAN honestly say: which of the 7 pillars are actually driving this
// call away from neutral, and those pillars have well-understood, different
// natural timeframes (RSI/momentum mean-reverts in days; a 200-day trend
// shift takes weeks; fundamentals move on a quarterly cadence). That's a
// transparent read of the same scores already computed, not a new model.

import type { PillarScore, SignalAction } from "./decision";

export type HorizonTerm = "SHORT" | "MEDIUM" | "LONG";

export type SignalHorizon = {
  term: HorizonTerm;
  label: string;
  reviewByDays: number;
  reviewBy: string; // ISO date
  dominantPillars: string[];
  reasoning: string;
  caveat: string;
};

const BUCKET_BY_PILLAR: Record<string, HorizonTerm> = {
  momentum: "SHORT",
  volume: "SHORT",
  sentiment: "SHORT",
  trend: "MEDIUM",
  marketSector: "MEDIUM",
  risk: "MEDIUM",
  fundamentals: "LONG",
};

const TERM_INFO: Record<HorizonTerm, { label: string; reviewByDays: number; reasoning: string }> = {
  SHORT: {
    label: "Short-term (days to ~2 weeks)",
    reviewByDays: 5,
    reasoning: "tends to shift quickly, often within days to two weeks",
  },
  MEDIUM: {
    label: "Medium-term (~2–4 weeks)",
    reviewByDays: 15,
    reasoning: "typically plays out over a few weeks",
  },
  LONG: {
    label: "Longer-term (~1–3 months)",
    reviewByDays: 45,
    reasoning: "moves on more of a quarterly cadence, taking a month or more to fully play out",
  },
};

export function computeSignalHorizon(pillars: PillarScore[], _signal: SignalAction): SignalHorizon {
  const magnitude: Record<HorizonTerm, number> = { SHORT: 0, MEDIUM: 0, LONG: 0 };
  const contributors: Record<HorizonTerm, { label: string; pull: number }[]> = { SHORT: [], MEDIUM: [], LONG: [] };

  for (const p of pillars) {
    if (!p.available) continue;
    const bucket = BUCKET_BY_PILLAR[p.key] ?? "MEDIUM";
    const pull = p.weight * Math.abs(p.score - 50);
    magnitude[bucket] += pull;
    contributors[bucket].push({ label: p.label, pull });
  }

  const total = magnitude.SHORT + magnitude.MEDIUM + magnitude.LONG;

  let term: HorizonTerm = "MEDIUM";
  if (total > 0) {
    term = (Object.keys(magnitude) as HorizonTerm[]).reduce((best, k) =>
      magnitude[k] > magnitude[best] ? k : best, "SHORT" as HorizonTerm);
  }

  const dominantPillars = contributors[term]
    .sort((a, b) => b.pull - a.pull)
    .filter((c) => c.pull > 0.5)
    .slice(0, 2)
    .map((c) => c.label);

  const info = TERM_INFO[term];
  const reviewBy = new Date();
  reviewBy.setDate(reviewBy.getDate() + info.reviewByDays);

  return {
    term,
    label: info.label,
    reviewByDays: info.reviewByDays,
    reviewBy: reviewBy.toISOString().slice(0, 10),
    dominantPillars,
    reasoning: dominantPillars.length > 0
      ? `This call is driven mainly by ${dominantPillars.join(" and ")} — this kind of factor ${info.reasoning}.`
      : `This call's driving factors ${info.reasoning}.`,
    caveat: "This describes how long the underlying factors typically take to play out, and when to re-check — not a guarantee of price direction or timing.",
  };
}
