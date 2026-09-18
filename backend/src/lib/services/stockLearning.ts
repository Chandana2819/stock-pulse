// Stock Learning & Master Close-Up Review engine
// -------------------------------------------------
// Stock Signals (elsewhere in this app) answers "what is BullHawk saying
// about this stock today?". Everything in this file answers "I own this
// stock — looking at my position plus every daily StockSignals snapshot
// I've uploaded, what actually happened, and what should I watch?".
//
// Deliberately NOT an LLM call: every sentence is a template filled from a
// number this module computed from stored rows. A field with no data across
// the relevant period renders as "Data unavailable" — never guessed, never
// carried over from a different stock or month. This keeps "never invent
// data" true by construction, not by prompting.

export const UNAVAILABLE = "Data unavailable";

export type DailySignalRow = {
  tradingDate: Date;
  price: number | null;
  signal: string | null;
  score: number | null;
  confidence: number | null;
  risk: string | null;
  entryZoneMin: number | null;
  entryZoneMax: number | null;
  stopLoss: number | null;
  targetRangeMin: number | null;
  targetRangeMax: number | null;
  reasons: string[];
  warnings: string[];
  rsi: number | null;
  macd: number | null;
  trend: string | null;
  volume: number | null;
};

export type HoldingContext = { avgPrice: number; quantity: number } | null;

function avg(nums: number[]): number | null {
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}
function sortRows(rows: DailySignalRow[]) {
  return [...rows].sort((a, b) => a.tradingDate.getTime() - b.tradingDate.getTime());
}
function lastNonNull<T, K extends keyof T>(rows: T[], key: K): T[K] | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i][key];
    if (v != null) return v as any;
  }
  return null;
}
function firstNonNull<T, K extends keyof T>(rows: T[], key: K): T[K] | null {
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i][key];
    if (v != null) return v as any;
  }
  return null;
}

const RISK_RANK: Record<string, number> = { LOW: 1, MODERATE: 2, MEDIUM: 2, HIGH: 3, "VERY HIGH": 4 };

// ─────────────────────────  MONTHLY OVERVIEW  ─────────────────────────

export type MonthlyOverview = {
  month: number;
  year: number;
  tradingDays: number;
  stockReturnPct: number | null;
  myReturnPct: number | null; // this month's price move relative to my average buy price
  avgScore: number | null;
  lastScore: number | null;
  startScore: number | null;
  highScore: number | null;
  lowScore: number | null;
  avgConfidence: number | null;
  lastConfidence: number | null;
  startConfidence: number | null;
  mostFrequentSignal: string | null;
  firstSignal: string | null;
  lastSignal: string | null;
  signalChanges: number;
  signalCounts: Record<string, number>;
  currentRisk: string | null;
  previousRisk: string | null;
  riskChanges: number;
  investedValue: number | null;
  currentValue: number | null;
  pl: number | null;
  plPct: number | null;
};

export function computeMonthlyOverview(rows: DailySignalRow[], month: number, year: number, holding: HoldingContext): MonthlyOverview {
  const sorted = sortRows(rows);
  const prices = sorted.map((r) => r.price).filter((p): p is number => p != null);
  const firstPrice = prices[0] ?? null;
  const lastPrice = prices[prices.length - 1] ?? null;
  const stockReturnPct = firstPrice != null && lastPrice != null && firstPrice !== 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : null;
  const myReturnPct = holding && firstPrice != null && lastPrice != null && holding.avgPrice !== 0 ? ((lastPrice - firstPrice) / holding.avgPrice) * 100 : null;

  const scores = sorted.map((r) => r.score).filter((s): s is number => s != null);
  const confidences = sorted.map((r) => r.confidence).filter((c): c is number => c != null);

  const signalRows = sorted.filter((r) => r.signal != null) as (DailySignalRow & { signal: string })[];
  const signalCounts: Record<string, number> = {};
  for (const r of signalRows) signalCounts[r.signal] = (signalCounts[r.signal] ?? 0) + 1;
  const mostFrequentSignal = Object.entries(signalCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  let signalChanges = 0;
  for (let i = 1; i < signalRows.length; i++) if (signalRows[i].signal !== signalRows[i - 1].signal) signalChanges++;

  const riskRows = sorted.filter((r) => r.risk != null) as (DailySignalRow & { risk: string })[];
  let riskChanges = 0;
  for (let i = 1; i < riskRows.length; i++) if (riskRows[i].risk !== riskRows[i - 1].risk) riskChanges++;

  let investedValue: number | null = null;
  let currentValue: number | null = null;
  let pl: number | null = null;
  let plPct: number | null = null;
  if (holding) {
    investedValue = holding.avgPrice * holding.quantity;
    if (lastPrice != null) {
      currentValue = lastPrice * holding.quantity;
      pl = currentValue - investedValue;
      plPct = investedValue !== 0 ? (pl / investedValue) * 100 : null;
    }
  }

  return {
    month,
    year,
    tradingDays: sorted.length,
    stockReturnPct,
    myReturnPct,
    avgScore: avg(scores),
    lastScore: lastNonNull(sorted, "score"),
    startScore: firstNonNull(sorted, "score"),
    highScore: scores.length > 0 ? Math.max(...scores) : null,
    lowScore: scores.length > 0 ? Math.min(...scores) : null,
    avgConfidence: avg(confidences),
    lastConfidence: lastNonNull(sorted, "confidence"),
    startConfidence: firstNonNull(sorted, "confidence"),
    mostFrequentSignal,
    firstSignal: signalRows[0]?.signal ?? null,
    lastSignal: signalRows[signalRows.length - 1]?.signal ?? null,
    signalChanges,
    signalCounts,
    currentRisk: riskRows[riskRows.length - 1]?.risk ?? null,
    previousRisk: riskRows[0]?.risk ?? null,
    riskChanges,
    investedValue,
    currentValue,
    pl,
    plPct,
  };
}

// ─────────────────────────  SIGNAL JOURNEY  ─────────────────────────

export type SignalJourney = {
  timeline: { date: string; signal: string | null }[];
  counts: Record<string, number>;
  mostFrequentSignal: string | null;
  firstSignal: string | null;
  lastSignal: string | null;
  signalChanges: number;
};

export function computeSignalJourney(rows: DailySignalRow[]): SignalJourney {
  const sorted = sortRows(rows);
  const timeline = sorted.map((r) => ({ date: r.tradingDate.toISOString().slice(0, 10), signal: r.signal }));
  const withSignal = sorted.filter((r) => r.signal != null) as (DailySignalRow & { signal: string })[];
  const counts: Record<string, number> = {};
  for (const r of withSignal) counts[r.signal] = (counts[r.signal] ?? 0) + 1;
  let signalChanges = 0;
  for (let i = 1; i < withSignal.length; i++) if (withSignal[i].signal !== withSignal[i - 1].signal) signalChanges++;
  return {
    timeline,
    counts,
    mostFrequentSignal: Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    firstSignal: withSignal[0]?.signal ?? null,
    lastSignal: withSignal[withSignal.length - 1]?.signal ?? null,
    signalChanges,
  };
}

// ─────────────────────  SCORE & CONFIDENCE MOVEMENT  ─────────────────────

export type SeriesStats = { series: { date: string; value: number | null }[]; start: number | null; end: number | null; avg: number | null; high: number | null; low: number | null; change: number | null };

function seriesStats(rows: DailySignalRow[], key: "score" | "confidence"): SeriesStats {
  const sorted = sortRows(rows);
  const series = sorted.map((r) => ({ date: r.tradingDate.toISOString().slice(0, 10), value: r[key] }));
  const values = series.map((s) => s.value).filter((v): v is number => v != null);
  const start = values[0] ?? null;
  const end = values[values.length - 1] ?? null;
  return {
    series,
    start,
    end,
    avg: avg(values),
    high: values.length > 0 ? Math.max(...values) : null,
    low: values.length > 0 ? Math.min(...values) : null,
    change: start != null && end != null ? end - start : null,
  };
}

export function computeScoreConfidenceMovement(rows: DailySignalRow[]): { score: SeriesStats; confidence: SeriesStats } {
  return { score: seriesStats(rows, "score"), confidence: seriesStats(rows, "confidence") };
}

// ─────────────────────────  REASONS ANALYSIS  ─────────────────────────

const NEGATIVE_KEYWORDS = ["downtrend", "weak", "overbought", "oversold", "bearish", "unfavorable", "high risk", "distribution", "selling pressure", "negative", "resistance"];
const POSITIVE_KEYWORDS = ["uptrend", "bullish", "strong", "favorable", "growth", "positive", "accumulation", "healthy", "low / favorable"];

function classifyReason(text: string): "POSITIVE" | "NEGATIVE" | "NEUTRAL" {
  const t = text.toLowerCase();
  if (NEGATIVE_KEYWORDS.some((k) => t.includes(k))) return "NEGATIVE";
  if (POSITIVE_KEYWORDS.some((k) => t.includes(k))) return "POSITIVE";
  return "NEUTRAL";
}

export type ReasonsAnalysis = {
  tradingDays: number;
  positive: { text: string; days: number }[];
  negative: { text: string; days: number }[];
  neutral: { text: string; days: number }[];
};

export function computeReasonsAnalysis(rows: DailySignalRow[]): ReasonsAnalysis {
  const tradingDays = rows.length;
  const counts = new Map<string, number>();
  for (const r of rows) for (const reason of r.reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);

  const positive: { text: string; days: number }[] = [];
  const negative: { text: string; days: number }[] = [];
  const neutral: { text: string; days: number }[] = [];
  for (const [text, days] of counts.entries()) {
    const bucket = classifyReason(text) === "POSITIVE" ? positive : classifyReason(text) === "NEGATIVE" ? negative : neutral;
    bucket.push({ text, days });
  }
  const byDaysDesc = (a: { days: number }, b: { days: number }) => b.days - a.days;
  return { tradingDays, positive: positive.sort(byDaysDesc), negative: negative.sort(byDaysDesc), neutral: neutral.sort(byDaysDesc) };
}

// ─────────────────────────  WARNINGS ANALYSIS  ─────────────────────────

export type WarningsAnalysis = {
  hasAnyWarnings: boolean;
  current: string[];
  history: { text: string; days: number }[];
  newThisMonth: string[];
  disappeared: string[];
};

export function computeWarningsAnalysis(rows: DailySignalRow[]): WarningsAnalysis {
  const sorted = sortRows(rows);
  const counts = new Map<string, number>();
  for (const r of sorted) for (const w of r.warnings) counts.set(w, (counts.get(w) ?? 0) + 1);

  const mid = Math.floor(sorted.length / 2);
  const firstHalf = new Set(sorted.slice(0, mid).flatMap((r) => r.warnings));
  const secondHalf = new Set(sorted.slice(mid).flatMap((r) => r.warnings));

  const newThisMonth = Array.from(secondHalf).filter((w) => !firstHalf.has(w));
  const disappeared = Array.from(firstHalf).filter((w) => !secondHalf.has(w));
  const current = sorted[sorted.length - 1]?.warnings ?? [];

  return {
    hasAnyWarnings: counts.size > 0,
    current,
    history: Array.from(counts.entries()).map(([text, days]) => ({ text, days })).sort((a, b) => b.days - a.days),
    newThisMonth,
    disappeared,
  };
}

// ─────────────────────  ENTRY / STOP / TARGET EVOLUTION  ─────────────────────

export type EntryStopTargetEvolution = {
  points: { date: string; entryMin: number | null; entryMax: number | null; stopLoss: number | null; targetMin: number | null; targetMax: number | null }[];
  summary: string[];
};

export function computeEntryStopTargetEvolution(rows: DailySignalRow[]): EntryStopTargetEvolution {
  const sorted = sortRows(rows).filter((r) => r.entryZoneMin != null || r.stopLoss != null || r.targetRangeMin != null);
  const points = sorted.map((r) => ({
    date: r.tradingDate.toISOString().slice(0, 10),
    entryMin: r.entryZoneMin,
    entryMax: r.entryZoneMax,
    stopLoss: r.stopLoss,
    targetMin: r.targetRangeMin,
    targetMax: r.targetRangeMax,
  }));

  const summary: string[] = [];
  const firstStop = firstNonNull(sorted, "stopLoss");
  const lastStop = lastNonNull(sorted, "stopLoss");
  if (firstStop != null && lastStop != null && firstStop !== lastStop) {
    summary.push(`Stop-loss moved from ₹${firstStop.toFixed(2)} to ₹${lastStop.toFixed(2)} during the month.`);
  }
  const firstTargetMax = firstNonNull(sorted, "targetRangeMax");
  const lastTargetMax = lastNonNull(sorted, "targetRangeMax");
  if (firstTargetMax != null && lastTargetMax != null && firstTargetMax !== lastTargetMax) {
    summary.push(`Target range ceiling moved from ₹${firstTargetMax.toFixed(2)} to ₹${lastTargetMax.toFixed(2)} during the month.`);
  }
  if (summary.length === 0 && points.length > 0) summary.push("Entry/stop/target levels stayed the same across the days they were provided.");
  if (points.length === 0) summary.push(UNAVAILABLE);

  return { points, summary };
}

// ─────────────────────────  RISK REVIEW  ─────────────────────────

export type RiskReview = {
  history: { date: string; risk: string | null }[];
  daysAtRisk: Record<string, number>;
  currentRisk: string | null;
  previousRisk: string | null;
  riskChanges: number;
};

export function computeRiskReview(rows: DailySignalRow[]): RiskReview {
  const sorted = sortRows(rows);
  const history = sorted.map((r) => ({ date: r.tradingDate.toISOString().slice(0, 10), risk: r.risk }));
  const riskRows = sorted.filter((r) => r.risk != null) as (DailySignalRow & { risk: string })[];
  const daysAtRisk: Record<string, number> = {};
  for (const r of riskRows) daysAtRisk[r.risk] = (daysAtRisk[r.risk] ?? 0) + 1;
  let riskChanges = 0;
  for (let i = 1; i < riskRows.length; i++) if (riskRows[i].risk !== riskRows[i - 1].risk) riskChanges++;
  return {
    history,
    daysAtRisk,
    currentRisk: riskRows[riskRows.length - 1]?.risk ?? null,
    previousRisk: riskRows[0]?.risk ?? null,
    riskChanges,
  };
}

// ─────────────────────  WHAT IMPROVED / WEAKENED / STABLE  ─────────────────────

export type ChangeSummary = { improved: string[]; weakened: string[]; stable: string[] };

const SCORE_THRESHOLD = 3;
const CONF_THRESHOLD = 3;

export function computeChangeSummary(current: MonthlyOverview, previous: MonthlyOverview | null, currentWarnings: WarningsAnalysis, previousWarnings: WarningsAnalysis | null): ChangeSummary {
  const improved: string[] = [];
  const weakened: string[] = [];
  const stable: string[] = [];

  if (!previous || previous.tradingDays === 0) {
    const msg = "No previous month's data is available for comparison.";
    return { improved: [msg], weakened: [msg], stable: [msg] };
  }

  if (current.avgScore != null && previous.avgScore != null) {
    const diff = current.avgScore - previous.avgScore;
    if (diff >= SCORE_THRESHOLD) improved.push(`Average score increased from ${previous.avgScore.toFixed(1)} to ${current.avgScore.toFixed(1)}.`);
    else if (diff <= -SCORE_THRESHOLD) weakened.push(`Average score declined from ${previous.avgScore.toFixed(1)} to ${current.avgScore.toFixed(1)}.`);
    else stable.push(`Average score stayed roughly the same (${previous.avgScore.toFixed(1)} vs ${current.avgScore.toFixed(1)}).`);
  }

  if (current.avgConfidence != null && previous.avgConfidence != null) {
    const diff = current.avgConfidence - previous.avgConfidence;
    if (diff >= CONF_THRESHOLD) improved.push(`Average confidence increased from ${previous.avgConfidence.toFixed(0)}% to ${current.avgConfidence.toFixed(0)}%.`);
    else if (diff <= -CONF_THRESHOLD) weakened.push(`Average confidence declined from ${previous.avgConfidence.toFixed(0)}% to ${current.avgConfidence.toFixed(0)}%.`);
    else stable.push(`Average confidence stayed roughly the same (${previous.avgConfidence.toFixed(0)}% vs ${current.avgConfidence.toFixed(0)}%).`);
  }

  if (current.currentRisk && previous.currentRisk) {
    const curRank = RISK_RANK[current.currentRisk] ?? 0;
    const prevRank = RISK_RANK[previous.currentRisk] ?? 0;
    if (curRank < prevRank) improved.push(`Risk moved from ${previous.currentRisk} to ${current.currentRisk}.`);
    else if (curRank > prevRank) weakened.push(`Risk moved from ${previous.currentRisk} to ${current.currentRisk}.`);
    else stable.push(`Risk remained ${current.currentRisk} for most of the period.`);
  }

  if (current.signalChanges !== previous.signalChanges) {
    if (current.signalChanges < previous.signalChanges) improved.push(`Signal became more consistent (${current.signalChanges} changes vs ${previous.signalChanges} last month).`);
    else weakened.push(`Signal became less consistent (${current.signalChanges} changes vs ${previous.signalChanges} last month).`);
  } else if (previous.tradingDays > 0) {
    stable.push(`Signal consistency was unchanged (${current.signalChanges} changes both months).`);
  }

  if (current.stockReturnPct != null && previous.stockReturnPct != null) {
    if (current.stockReturnPct > previous.stockReturnPct + 1) improved.push(`Monthly price return improved (${current.stockReturnPct.toFixed(2)}% vs ${previous.stockReturnPct.toFixed(2)}% last month).`);
    else if (current.stockReturnPct < previous.stockReturnPct - 1) weakened.push(`Monthly price return declined (${current.stockReturnPct.toFixed(2)}% vs ${previous.stockReturnPct.toFixed(2)}% last month).`);
  }

  if (previousWarnings) {
    if (currentWarnings.current.length === 0 && previousWarnings.current.length > 0) improved.push("Previously active warnings are no longer present.");
    if (currentWarnings.current.length > 0 && previousWarnings.current.length === 0) weakened.push(`New warning(s) appeared this month: ${currentWarnings.current.join(", ")}.`);
  }

  if (improved.length === 0) improved.push("No metric showed a clear improvement this month.");
  if (weakened.length === 0) weakened.push("No metric showed clear weakening this month.");
  if (stable.length === 0) stable.push("No comparable metrics were available to judge stability.");

  return { improved, weakened, stable };
}

// ─────────────────────  HISTORICAL SIGNAL VALIDATION  ─────────────────────

export type HorizonResult = { horizon: number; sampleSize: number; avgReturnPct: number | null };
export type HistoricalValidation = {
  buy: HorizonResult[];
  sell: HorizonResult[];
  note: string | null;
};

const HORIZONS = [5, 10, 20];

function signalGroup(signal: string): "BUY" | "SELL" | null {
  const s = signal.toUpperCase();
  if (s.includes("BUY")) return "BUY";
  if (s.includes("SELL") || s === "REDUCE") return "SELL";
  return null;
}

/** Uses every uploaded row for the ticker (not just one month) — "N trading days later" means the Nth later UPLOADED row, since that's the only notion of "later" this data supports. */
export function computeHistoricalValidation(allRows: DailySignalRow[]): HistoricalValidation {
  const sorted = sortRows(allRows).filter((r) => r.price != null);
  if (sorted.length < HORIZONS[0] + 1) {
    return { buy: HORIZONS.map((h) => ({ horizon: h, sampleSize: 0, avgReturnPct: null })), sell: HORIZONS.map((h) => ({ horizon: h, sampleSize: 0, avgReturnPct: null })), note: "Not enough uploaded price history yet to validate past signals." };
  }

  const compute = (group: "BUY" | "SELL"): HorizonResult[] =>
    HORIZONS.map((h) => {
      const returns: number[] = [];
      for (let i = 0; i < sorted.length - h; i++) {
        const row = sorted[i];
        if (!row.signal || signalGroup(row.signal) !== group) continue;
        const startPrice = row.price!;
        const futurePrice = sorted[i + h].price;
        if (futurePrice == null || startPrice === 0) continue;
        returns.push(((futurePrice - startPrice) / startPrice) * 100);
      }
      return { horizon: h, sampleSize: returns.length, avgReturnPct: avg(returns) };
    });

  return { buy: compute("BUY"), sell: compute("SELL"), note: null };
}

// ─────────────────────────  WHAT TO MONITOR  ─────────────────────────

export function computeWhatToMonitor(overview: MonthlyOverview, warnings: WarningsAnalysis, evolution: EntryStopTargetEvolution): string[] {
  const points: string[] = [];
  if (overview.lastScore != null) points.push(`Score remains above ${overview.lastScore.toFixed(0)} (current level).`);
  if (overview.lastConfidence != null) points.push(`Confidence remains above ${overview.lastConfidence.toFixed(0)}%.`);
  const lastStop = [...evolution.points].reverse().find((p) => p.stopLoss != null)?.stopLoss ?? null;
  if (lastStop != null) points.push(`Price stays above the current stop-loss level of ₹${lastStop.toFixed(2)}.`);
  const lastTarget = [...evolution.points].reverse().find((p) => p.targetMax != null)?.targetMax ?? null;
  if (lastTarget != null) points.push(`Watch for price approaching the target range ceiling of ₹${lastTarget.toFixed(2)}.`);
  if (warnings.current.length > 0) points.push(`Monitor currently active warning(s): ${warnings.current.join(", ")}.`);
  if (overview.signalChanges >= 3) points.push(`Signal has changed ${overview.signalChanges} times this month — watch for it to stabilize.`);
  if (points.length === 0) points.push("Not enough uploaded data yet to generate specific monitoring points — keep uploading daily files.");
  return points;
}

// ─────────────────────────  MASTER MONTHLY REVIEW  ─────────────────────────

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pct = (n: number | null) => (n == null ? UNAVAILABLE : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);
const price = (n: number | null) => (n == null ? UNAVAILABLE : `₹${n.toFixed(2)}`);

export type MasterMonthlyReview = {
  monthLabel: string;
  tradingDaysNote: string;
  whatHappened: string[];
  signalBehavior: string[];
  priceBehavior: string[];
  myPosition: string[];
  whatImproved: string[];
  whatWeakened: string[];
  risks: string[];
  whatToMonitor: string[];
};

export function buildMasterMonthlyReview(
  overview: MonthlyOverview,
  journey: SignalJourney,
  changeSummary: ChangeSummary,
  monitor: string[]
): MasterMonthlyReview {
  const monthLabel = `${MONTH_NAMES[overview.month - 1]} ${overview.year}`;
  const tradingDaysNote =
    overview.tradingDays === 0
      ? `No StockSignals data available for ${monthLabel}.`
      : `Review based on ${overview.tradingDays} available trading day${overview.tradingDays === 1 ? "" : "s"} for ${monthLabel}.`;

  const whatHappened =
    overview.tradingDays === 0
      ? [tradingDaysNote]
      : [
          `Signal was mostly ${overview.mostFrequentSignal ?? UNAVAILABLE} this month, changing ${overview.signalChanges} time${overview.signalChanges === 1 ? "" : "s"}.`,
          `Price moved ${pct(overview.stockReturnPct)} across the month.`,
          `Average score ${overview.avgScore != null ? overview.avgScore.toFixed(1) : UNAVAILABLE}, average confidence ${overview.avgConfidence != null ? `${overview.avgConfidence.toFixed(0)}%` : UNAVAILABLE}.`,
        ];

  const signalBehavior = [
    `Signal counts: ${Object.entries(journey.counts).map(([s, c]) => `${s}: ${c} day${c === 1 ? "" : "s"}`).join(", ") || UNAVAILABLE}.`,
    `First signal this month: ${journey.firstSignal ?? UNAVAILABLE}. Latest: ${journey.lastSignal ?? UNAVAILABLE}.`,
  ];

  const priceBehavior = [`Monthly stock return: ${pct(overview.stockReturnPct)}.`];

  const myPosition =
    overview.investedValue == null
      ? [`No holding on record for this stock — ${UNAVAILABLE} for P&L.`]
      : [
          `Invested: ${price(overview.investedValue)}. Value at month-end price: ${overview.currentValue == null ? UNAVAILABLE : price(overview.currentValue)}.`,
          `Profit/Loss: ${overview.pl == null ? UNAVAILABLE : `${price(overview.pl)} (${pct(overview.plPct)})`}.`,
        ];

  const risks =
    overview.currentRisk == null
      ? [UNAVAILABLE]
      : [`Current risk: ${overview.currentRisk}${overview.riskChanges > 0 ? ` (changed ${overview.riskChanges} time${overview.riskChanges === 1 ? "" : "s"} this month)` : ""}.`];

  return {
    monthLabel,
    tradingDaysNote,
    whatHappened,
    signalBehavior,
    priceBehavior,
    myPosition,
    whatImproved: changeSummary.improved.length > 0 ? changeSummary.improved : ["No previous month to compare, or no measurable improvement detected."],
    whatWeakened: changeSummary.weakened.length > 0 ? changeSummary.weakened : ["No measurable weakening detected."],
    risks,
    whatToMonitor: monitor,
  };
}
