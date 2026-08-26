// News interpretation engine.
//
// Google News RSS gives us headlines only — no sentiment, no entity tags. This
// module derives them with a transparent lexicon so every label can be
// explained ("marked negative because it contains 'downgrade', 'plunge'"),
// and every consumer shows it as *our* inference, not the publisher's.
//
// It is deliberately conservative: anything without clear signal stays NEUTRAL
// / LOW importance rather than being forced into a bucket.

import { UNIVERSE, lookupUniverse } from "../universe";

const NEGATIVE = [
  "fall", "falls", "fell", "drop", "drops", "plunge", "plunges", "slump", "slumps", "crash", "crashes",
  "decline", "declines", "loss", "losses", "downgrade", "downgrades", "cut", "cuts", "weak", "weakness",
  "miss", "misses", "misses estimates", "probe", "fraud", "scam", "penalty", "fine", "lawsuit", "ban",
  "resign", "resigns", "layoff", "layoffs", "default", "bankruptcy", "recession", "selloff", "sell-off",
  "warning", "warns", "concern", "concerns", "risk", "risks", "protest", "strike", "shortage", "delay",
  "tariff", "inflation", "hike", "downtrend", "bearish", "outflow", "outflows", "red",
];

const POSITIVE = [
  "rise", "rises", "rose", "gain", "gains", "surge", "surges", "jump", "jumps", "rally", "rallies",
  "soar", "soars", "record", "high", "beat", "beats", "upgrade", "upgrades", "profit", "profits",
  "growth", "expand", "expansion", "order", "orders", "win", "wins", "deal", "approval", "approved",
  "launch", "launches", "dividend", "bonus", "buyback", "strong", "outperform", "bullish", "inflow",
  "inflows", "recovery", "revival", "boost", "boosts", "green", "acquisition", "partnership",
];

const HIGH_IMPORTANCE = [
  "rbi", "fed", "federal reserve", "budget", "gdp", "inflation", "repo rate", "policy", "sebi",
  "earnings", "results", "quarterly", "guidance", "merger", "acquisition", "ipo", "downgrade",
  "upgrade", "war", "sanction", "tariff", "crude", "election", "monetary policy", "rate cut", "rate hike",
];

const MEDIUM_IMPORTANCE = [
  "dividend", "bonus", "split", "buyback", "order win", "contract", "expansion", "capex", "stake",
  "fii", "dii", "block deal", "bulk deal", "management", "ceo", "cfo",
];

const SECTOR_KEYWORDS: Record<string, string[]> = {
  IT: ["it sector", "software", "tech", "technology", "infotech", "outsourcing", "ai "],
  BANK: ["bank", "banking", "lender", "nbfc", "credit", "loan", "rbi"],
  AUTO: ["auto", "automobile", "car", "vehicle", "ev", "two-wheeler"],
  PHARMA: ["pharma", "drug", "usfda", "healthcare", "hospital"],
  FMCG: ["fmcg", "consumer", "retail", "staples"],
  METAL: ["steel", "metal", "aluminium", "zinc", "mining", "coal"],
  ENERGY: ["oil", "crude", "gas", "energy", "power", "refinery", "solar", "renewable"],
  REALTY: ["realty", "real estate", "housing", "property", "infrastructure", "cement"],
  FIN: ["insurance", "mutual fund", "amc", "finance", "financial services"],
};

export type NewsAnalysis = {
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  /** -1 … +1 */
  sentimentScore: number;
  importance: "HIGH" | "MEDIUM" | "LOW";
  symbols: string[];
  sectors: string[];
  /** The exact words that drove the labels, so the UI can justify them. */
  matchedTerms: string[];
};

function countMatches(text: string, terms: string[]): string[] {
  return terms.filter((t) => (t.includes(" ") ? text.includes(t) : new RegExp(`\\b${t}\\b`).test(text)));
}

export function analyzeHeadline(title: string, hintSymbol?: string): NewsAnalysis {
  const text = ` ${title.toLowerCase()} `;

  const negHits = countMatches(text, NEGATIVE);
  const posHits = countMatches(text, POSITIVE);
  const total = negHits.length + posHits.length;
  const rawScore = total === 0 ? 0 : (posHits.length - negHits.length) / total;
  // Damp single-word verdicts: one matching word is weak evidence.
  const confidenceFactor = Math.min(1, total / 3);
  const sentimentScore = Number((rawScore * confidenceFactor).toFixed(3));

  const sentiment: NewsAnalysis["sentiment"] =
    sentimentScore > 0.15 ? "POSITIVE" : sentimentScore < -0.15 ? "NEGATIVE" : "NEUTRAL";

  const highHits = countMatches(text, HIGH_IMPORTANCE);
  const medHits = countMatches(text, MEDIUM_IMPORTANCE);
  const importance: NewsAnalysis["importance"] = highHits.length > 0 ? "HIGH" : medHits.length > 0 ? "MEDIUM" : "LOW";

  const symbols = new Set<string>();
  if (hintSymbol) symbols.add(hintSymbol.toUpperCase());
  for (const u of UNIVERSE) {
    const display = u.display.toLowerCase();
    const nameHead = u.name.split(" ")[0].toLowerCase();
    if (display.length >= 3 && text.includes(` ${display} `)) symbols.add(u.symbol);
    else if (nameHead.length >= 5 && text.includes(nameHead)) symbols.add(u.symbol);
  }

  const sectors = new Set<string>();
  for (const [key, words] of Object.entries(SECTOR_KEYWORDS)) {
    if (words.some((w) => text.includes(w))) sectors.add(key);
  }
  for (const sym of symbols) {
    const entry = lookupUniverse(sym);
    if (entry) sectors.add(entry.sectorKey);
  }

  return {
    sentiment,
    sentimentScore,
    importance,
    symbols: [...symbols],
    sectors: [...sectors],
    matchedTerms: [...negHits, ...posHits, ...highHits, ...medHits],
  };
}

/** Aggregate sentiment across a batch of headlines, weighted by importance. */
export function aggregateSentiment(items: NewsAnalysis[]): { score: number; label: "POSITIVE" | "NEGATIVE" | "NEUTRAL"; counts: Record<string, number> } {
  const weight = (i: NewsAnalysis) => (i.importance === "HIGH" ? 3 : i.importance === "MEDIUM" ? 2 : 1);
  const totalWeight = items.reduce((acc, i) => acc + weight(i), 0);
  const score = totalWeight === 0 ? 0 : items.reduce((acc, i) => acc + i.sentimentScore * weight(i), 0) / totalWeight;
  const counts = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.sentiment] = (acc[i.sentiment] ?? 0) + 1;
    return acc;
  }, {});
  return {
    score: Number(score.toFixed(3)),
    label: score > 0.12 ? "POSITIVE" : score < -0.12 ? "NEGATIVE" : "NEUTRAL",
    counts,
  };
}
