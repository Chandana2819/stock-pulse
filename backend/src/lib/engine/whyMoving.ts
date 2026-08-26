// "Why is this stock moving?" — explainable attribution engine.
//
// We do not have access to a licensed factor-attribution feed, so this engine
// builds the explanation from signals we can actually compute: the stock's own
// move vs its sector index vs the broad market, technical extremes, volume,
// and recent headlines. Every weight is visible and every claim carries a
// confidence — there is no invented certainty about "the" cause.

import type { NewsAnalysis } from "./sentiment";
import { lookupUniverse } from "../universe";

export type MoveAttribution = {
  stockChangePct: number;
  breakdown: { label: string; weightPct: number; detail: string }[];
  mainReasons: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  disclaimer: string;
};

export function explainMove(input: {
  symbol: string;
  stockChangePct: number;
  marketChangePct: number | null;
  sectorChangePct: number | null;
  volume: number | null;
  avgVolume: number | null;
  rsi14: number | null;
  news: Array<{ title: string; analysis: NewsAnalysis }>;
}): MoveAttribution {
  const { stockChangePct } = input;
  const absMove = Math.abs(stockChangePct);
  const entry = lookupUniverse(input.symbol);

  // Decompose the stock's move into market-explained, sector-explained and
  // "everything else" (company-specific / technical / unexplained) buckets.
  const marketContribution = input.marketChangePct != null ? clamp(input.marketChangePct, -absMove, absMove) : 0;
  const sectorExcess =
    input.sectorChangePct != null && input.marketChangePct != null
      ? clamp(input.sectorChangePct - input.marketChangePct, -absMove, absMove)
      : 0;
  const explainedSoFar = marketContribution + sectorExcess;
  const residual = stockChangePct - explainedSoFar;

  const volumeSpike = input.volume != null && input.avgVolume && input.avgVolume > 0 ? input.volume / input.avgVolume : null;
  const relevantNews = input.news.filter(
    (n) => n.analysis.symbols.includes(input.symbol) || (entry && n.analysis.sectors.includes(entry.sectorKey))
  );
  const newsSentiment = relevantNews.length
    ? relevantNews.reduce((a, n) => a + n.analysis.sentimentScore, 0) / relevantNews.length
    : 0;

  // Split the residual between "news / company-specific" and "technical /
  // unexplained" using how much corroborating news and volume we actually see.
  const newsWeight = relevantNews.length > 0 ? Math.min(1, 0.3 + relevantNews.length * 0.15) : 0;
  const newsContribution = residual * newsWeight * (newsSentiment !== 0 ? Math.sign(newsSentiment) === Math.sign(residual || 1) ? 1 : 0.4 : 0.5);
  const technicalContribution = residual - newsContribution;

  const parts = [
    { key: "market", label: "Broad market move", value: marketContribution },
    { key: "sector", label: "Sector movement", value: sectorExcess },
    { key: "news", label: "Company news", value: newsContribution },
    { key: "technical", label: "Technical / other factors", value: technicalContribution },
  ];

  const totalAbs = parts.reduce((acc, p) => acc + Math.abs(p.value), 0) || 1;
  const breakdown = parts.map((p) => ({
    label: p.label,
    weightPct: Math.round((Math.abs(p.value) / totalAbs) * 100),
    detail: describePart(p.key, p.value, { volumeSpike, rsi: input.rsi14, sectorChange: input.sectorChangePct, marketChange: input.marketChangePct }),
  }));

  const mainReasons: string[] = [];
  const sorted = [...parts].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  for (const p of sorted.slice(0, 3)) {
    if (Math.abs(p.value) < 0.15) continue;
    mainReasons.push(reasonSentence(p.key, p.value, entry?.sector ?? null));
  }
  if (relevantNews.length > 0 && Math.abs(newsContribution) >= 0.15) {
    const top = relevantNews[0];
    mainReasons.unshift(`Recent headline: "${top.title}"`);
  }
  if (volumeSpike != null && volumeSpike >= 2) {
    mainReasons.push(`Volume is ${volumeSpike.toFixed(1)}x the average — unusually high participation.`);
  }
  if (mainReasons.length === 0) {
    mainReasons.push("No single dominant driver identified — the move looks like normal daily volatility.");
  }

  // Confidence reflects how much of the move we could actually attribute to a
  // known factor, not how big the move is.
  const explainedFraction = 1 - Math.min(1, Math.abs(technicalContribution) / (absMove || 1));
  const confidence: MoveAttribution["confidence"] =
    explainedFraction > 0.65 && (relevantNews.length > 0 || Math.abs(sectorExcess) > 0.4)
      ? "HIGH"
      : explainedFraction > 0.35
      ? "MEDIUM"
      : "LOW";

  return {
    stockChangePct,
    breakdown,
    mainReasons: mainReasons.slice(0, 4),
    confidence,
    disclaimer:
      "This is an automated best-effort attribution based on index, sector and headline data — not a confirmed cause. Treat it as a starting point for your own research.",
  };
}

function describePart(
  key: string,
  value: number,
  ctx: { volumeSpike: number | null; rsi: number | null; sectorChange: number | null; marketChange: number | null }
): string {
  if (key === "market") return ctx.marketChange != null ? `Broad market moved ${fmtPct(ctx.marketChange)} today.` : "Market data unavailable.";
  if (key === "sector") return ctx.sectorChange != null ? `Sector index moved ${fmtPct(ctx.sectorChange)}, diverging from the broad market.` : "Sector data unavailable.";
  if (key === "news") return "Derived from recent headlines mentioning this stock or its sector.";
  if (ctx.rsi != null) {
    const rsiNote = ctx.rsi >= 70 ? " RSI is overbought." : ctx.rsi <= 30 ? " RSI is oversold." : "";
    return `Residual move not explained by market/sector/news — likely technical or stock-specific.${rsiNote}`;
  }
  return "Residual move not explained by market/sector/news — likely technical or stock-specific.";
}

function reasonSentence(key: string, value: number, sector: string | null): string {
  const dir = value >= 0 ? "supporting the move up" : "adding downward pressure";
  if (key === "market") return `Overall market weakness/strength is ${dir}.`;
  if (key === "sector") return `${sector ?? "The sector"} is moving ${value >= 0 ? "stronger" : "weaker"} than the broad market, ${dir}.`;
  if (key === "news") return `Recent news sentiment is ${value >= 0 ? "positive" : "negative"}, ${dir}.`;
  return `Stock-specific / technical factors are ${dir}.`;
}

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
