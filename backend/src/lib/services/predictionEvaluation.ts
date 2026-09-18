// Prediction Evaluation Engine
// -----------------------------
// Answers, for every stored daily prediction: did it actually hit its
// target, hit its stop-loss, or neither — using real historical OHLC
// candles, never invented prices. A prediction is never mutated; this
// module only ever reads a prediction and a candle series and produces an
// evaluation result, recomputed fresh each time (so PENDING correctly
// becomes TARGET_HIT/etc. as more real trading days occur).

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number };

export type EvaluationStatus =
  | "PENDING" // still within the evaluation window, not yet resolved
  | "TARGET_HIT"
  | "STOP_LOSS_HIT"
  | "EXPIRED" // window fully elapsed, neither level reached
  | "AMBIGUOUS" // target and stop both crossed the same day — order can't be determined from daily bars
  | "INSUFFICIENT_DATA" // no usable candle data covering the prediction date
  | "NOT_APPLICABLE"; // HOLD-type prediction — there is no target/stop to hit

export type EvaluationResult = {
  horizon: number;
  status: EvaluationStatus;
  entryReached: boolean | null;
  targetReached: boolean | null;
  stopLossReached: boolean | null;
  daysToOutcome: number | null;
  highestPrice: number | null;
  lowestPrice: number | null;
  closingPrice: number | null; // price at the end of the window (or latest available day within it)
  actualReturnPct: number | null; // vs. the prediction-day reference price
  note: string | null;
};

export type PredictionInput = {
  action: string | null;
  entryZoneMin: number | null;
  entryZoneMax: number | null;
  stopLoss: number | null;
  targetRangeMin: number | null;
  targetRangeMax: number | null;
  tradingDate: Date;
};

function actionGroup(action: string | null): "BUY" | "SELL" | "HOLD" | "OTHER" {
  if (!action) return "OTHER";
  const a = action.toUpperCase();
  if (a.includes("BUY")) return "BUY";
  if (a.includes("SELL") || a === "REDUCE") return "SELL";
  if (a === "HOLD") return "HOLD";
  return "OTHER";
}

/** Index of the candle on/immediately before the prediction date. */
function findAnchorIndex(candles: Candle[], predictionDate: Date): number {
  const targetSec = Math.floor(predictionDate.getTime() / 1000);
  let idx = -1;
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].time <= targetSec) idx = i;
    else break;
  }
  return idx;
}

export function evaluatePrediction(prediction: PredictionInput, candles: Candle[], horizon: number): EvaluationResult {
  const empty = (status: EvaluationStatus, note: string | null = null): EvaluationResult => ({
    horizon,
    status,
    entryReached: null,
    targetReached: null,
    stopLossReached: null,
    daysToOutcome: null,
    highestPrice: null,
    lowestPrice: null,
    closingPrice: null,
    actualReturnPct: null,
    note,
  });

  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const anchorIdx = findAnchorIndex(sorted, prediction.tradingDate);
  if (anchorIdx === -1) return empty("INSUFFICIENT_DATA", "No candle data covers the prediction date.");

  const referencePrice = sorted[anchorIdx].close;
  const windowCandles = sorted.slice(anchorIdx + 1, anchorIdx + 1 + horizon);

  const group = actionGroup(prediction.action);

  if (windowCandles.length === 0) {
    return empty("PENDING", "No trading days have elapsed since the prediction yet.");
  }

  const highs = windowCandles.map((c) => c.high);
  const lows = windowCandles.map((c) => c.low);
  const highestPrice = Math.max(...highs);
  const lowestPrice = Math.min(...lows);
  const closingPrice = windowCandles[windowCandles.length - 1].close;
  const actualReturnPct = referencePrice !== 0 ? ((closingPrice - referencePrice) / referencePrice) * 100 : null;

  const windowComplete = windowCandles.length >= horizon;

  if (group === "HOLD" || group === "OTHER") {
    return {
      horizon,
      status: "NOT_APPLICABLE",
      entryReached: null,
      targetReached: null,
      stopLossReached: null,
      daysToOutcome: null,
      highestPrice,
      lowestPrice,
      closingPrice,
      actualReturnPct,
      note: "This signal has no target/stop-loss to evaluate — only the subsequent price movement is measured.",
    };
  }

  const target = group === "BUY" ? prediction.targetRangeMin : prediction.targetRangeMax;
  const stop = prediction.stopLoss;

  if (target == null || stop == null) {
    return {
      horizon,
      status: "INSUFFICIENT_DATA",
      entryReached: null,
      targetReached: null,
      stopLossReached: null,
      daysToOutcome: null,
      highestPrice,
      lowestPrice,
      closingPrice,
      actualReturnPct,
      note: "This prediction did not include both a target and a stop-loss, so target/stop-loss cannot be evaluated.",
    };
  }

  const entryReached =
    prediction.entryZoneMin != null && prediction.entryZoneMax != null
      ? windowCandles.some((c) => c.low <= prediction.entryZoneMax! && c.high >= prediction.entryZoneMin!)
      : null;

  // Walk day by day so we respect chronological order rather than just checking the eventual high/low.
  let targetDay: number | null = null;
  let stopDay: number | null = null;
  let ambiguousDay: number | null = null;

  for (let i = 0; i < windowCandles.length; i++) {
    const c = windowCandles[i];
    const hitTarget = group === "BUY" ? c.high >= target : c.low <= target;
    const hitStop = group === "BUY" ? c.low <= stop : c.high >= stop;

    if (hitTarget && hitStop) {
      ambiguousDay = i;
      break;
    }
    if (hitTarget) {
      targetDay = i;
      break;
    }
    if (hitStop) {
      stopDay = i;
      break;
    }
  }

  if (ambiguousDay != null) {
    return {
      horizon,
      status: "AMBIGUOUS",
      entryReached,
      targetReached: null,
      stopLossReached: null,
      daysToOutcome: ambiguousDay + 1,
      highestPrice,
      lowestPrice,
      closingPrice,
      actualReturnPct,
      note: "Outcome cannot be determined from available data — both target and stop-loss were crossed within the same trading day.",
    };
  }

  if (targetDay != null) {
    return {
      horizon,
      status: "TARGET_HIT",
      entryReached,
      targetReached: true,
      stopLossReached: false,
      daysToOutcome: targetDay + 1,
      highestPrice,
      lowestPrice,
      closingPrice,
      actualReturnPct,
      note: null,
    };
  }

  if (stopDay != null) {
    return {
      horizon,
      status: "STOP_LOSS_HIT",
      entryReached,
      targetReached: false,
      stopLossReached: true,
      daysToOutcome: stopDay + 1,
      highestPrice,
      lowestPrice,
      closingPrice,
      actualReturnPct,
      note: null,
    };
  }

  return {
    horizon,
    status: windowComplete ? "EXPIRED" : "PENDING",
    entryReached,
    targetReached: false,
    stopLossReached: false,
    daysToOutcome: null,
    highestPrice,
    lowestPrice,
    closingPrice,
    actualReturnPct,
    note: windowComplete ? "Neither target nor stop-loss was reached within the evaluation window." : "Still within the evaluation window — more trading days are needed to resolve this.",
  };
}

// ─────────────────────────  AGGREGATE REVIEWS  ─────────────────────────

export type EvaluatedPrediction = {
  ticker: string;
  action: string | null;
  score: number | null;
  confidence: number | null;
  risk: string | null;
  sector: string | null;
  logicVersion: string;
  reasons: string[];
  evaluation: EvaluationResult;
};

export type ReviewBreakdown = {
  total: number;
  targetHit: number;
  stopLossHit: number;
  neither: number;
  pending: number;
  notApplicable: number;
  insufficientData: number;
  ambiguous: number;
  targetHitRate: number | null; // out of resolved (target+stop) predictions only
  stopLossRate: number | null;
  avgReturnPct: number | null;
  avgScore: number | null;
  avgConfidence: number | null;
  avgDaysToTarget: number | null;
};

export function summarize(predictions: EvaluatedPrediction[]): ReviewBreakdown {
  const total = predictions.length;
  const targetHit = predictions.filter((p) => p.evaluation.status === "TARGET_HIT").length;
  const stopLossHit = predictions.filter((p) => p.evaluation.status === "STOP_LOSS_HIT").length;
  const neither = predictions.filter((p) => p.evaluation.status === "EXPIRED").length;
  const pending = predictions.filter((p) => p.evaluation.status === "PENDING").length;
  const notApplicable = predictions.filter((p) => p.evaluation.status === "NOT_APPLICABLE").length;
  const insufficientData = predictions.filter((p) => p.evaluation.status === "INSUFFICIENT_DATA").length;
  const ambiguous = predictions.filter((p) => p.evaluation.status === "AMBIGUOUS").length;

  const resolved = targetHit + stopLossHit;
  const returns = predictions.map((p) => p.evaluation.actualReturnPct).filter((r): r is number => r != null);
  const scores = predictions.map((p) => p.score).filter((s): s is number => s != null);
  const confidences = predictions.map((p) => p.confidence).filter((c): c is number => c != null);
  const daysToTarget = predictions.filter((p) => p.evaluation.status === "TARGET_HIT").map((p) => p.evaluation.daysToOutcome).filter((d): d is number => d != null);

  const avg = (nums: number[]) => (nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null);

  return {
    total,
    targetHit,
    stopLossHit,
    neither,
    pending,
    notApplicable,
    insufficientData,
    ambiguous,
    targetHitRate: resolved > 0 ? (targetHit / resolved) * 100 : null,
    stopLossRate: resolved > 0 ? (stopLossHit / resolved) * 100 : null,
    avgReturnPct: avg(returns),
    avgScore: avg(scores),
    avgConfidence: avg(confidences),
    avgDaysToTarget: avg(daysToTarget),
  };
}

export type LogicVerdict = {
  verdict: "CONTINUE" | "NEEDS_TESTING" | "INSUFFICIENT_DATA_FOR_DECISION";
  message: string;
  currentHitRate: number | null;
  priorHitRate: number | null;
  sampleSize: number;
};

const MIN_SAMPLE_FOR_DECISION = 20;
const HIT_RATE_DROP_THRESHOLD = 10; // percentage points

export function evaluateLogicHealth(current: ReviewBreakdown, prior: ReviewBreakdown | null): LogicVerdict {
  const resolvedCurrent = current.targetHit + current.stopLossHit;
  if (resolvedCurrent < MIN_SAMPLE_FOR_DECISION) {
    return {
      verdict: "INSUFFICIENT_DATA_FOR_DECISION",
      message: `Not enough resolved predictions yet (${resolvedCurrent}) to judge whether to continue or change the current logic. At least ${MIN_SAMPLE_FOR_DECISION} resolved predictions are needed.`,
      currentHitRate: current.targetHitRate,
      priorHitRate: prior?.targetHitRate ?? null,
      sampleSize: resolvedCurrent,
    };
  }

  if (!prior || prior.targetHit + prior.stopLossHit < MIN_SAMPLE_FOR_DECISION || current.targetHitRate == null || prior.targetHitRate == null) {
    return {
      verdict: "CONTINUE",
      message: "Current logic continues to perform consistently based on available historical evaluations.",
      currentHitRate: current.targetHitRate,
      priorHitRate: prior?.targetHitRate ?? null,
      sampleSize: resolvedCurrent,
    };
  }

  const drop = prior.targetHitRate - current.targetHitRate;
  if (drop >= HIT_RATE_DROP_THRESHOLD) {
    return {
      verdict: "NEEDS_TESTING",
      message: `Target hit rate dropped from ${prior.targetHitRate.toFixed(1)}% to ${current.targetHitRate.toFixed(1)}% (${drop.toFixed(1)} point decline) — current logic requires further testing.`,
      currentHitRate: current.targetHitRate,
      priorHitRate: prior.targetHitRate,
      sampleSize: resolvedCurrent,
    };
  }

  return {
    verdict: "CONTINUE",
    message: "Current logic continues to perform consistently based on available historical evaluations.",
    currentHitRate: current.targetHitRate,
    priorHitRate: prior.targetHitRate,
    sampleSize: resolvedCurrent,
  };
}
