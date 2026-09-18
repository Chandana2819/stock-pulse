import { describe, it, expect } from "vitest";
import { evaluatePrediction, summarize, evaluateLogicHealth, type Candle, type PredictionInput, type EvaluatedPrediction, type ReviewBreakdown } from "./predictionEvaluation";

const DAY = 86400;

function candle(dayOffset: number, high: number, low: number, close: number, open = close): Candle {
  return { time: dayOffset * DAY, open, high, low, close };
}

function buyPrediction(overrides: Partial<PredictionInput> = {}): PredictionInput {
  return {
    action: "BUY",
    entryZoneMin: 95,
    entryZoneMax: 100,
    stopLoss: 90,
    targetRangeMin: 110,
    targetRangeMax: 120,
    tradingDate: new Date(0),
    ...overrides,
  };
}

describe("evaluatePrediction — BUY", () => {
  it("marks TARGET_HIT the day the high first crosses the target, respecting order", () => {
    const candles = [
      candle(0, 100, 98, 99), // prediction day
      candle(1, 105, 97, 103),
      candle(2, 112, 102, 111), // target (110) crossed here — day 2 → daysToOutcome 2
      candle(3, 130, 111, 125),
    ];
    const result = evaluatePrediction(buyPrediction(), candles, 5);
    expect(result.status).toBe("TARGET_HIT");
    expect(result.daysToOutcome).toBe(2);
  });

  it("marks STOP_LOSS_HIT when the low crosses stop before target is ever reached", () => {
    const candles = [
      candle(0, 100, 98, 99),
      candle(1, 96, 89, 91), // stop-loss 90 crossed
      candle(2, 112, 100, 111), // target crossed later — should not override the earlier stop hit
    ];
    const result = evaluatePrediction(buyPrediction(), candles, 5);
    expect(result.status).toBe("STOP_LOSS_HIT");
    expect(result.daysToOutcome).toBe(1);
  });

  it("marks AMBIGUOUS when both target and stop are crossed within the same day, never guessing which came first", () => {
    const candles = [candle(0, 100, 98, 99), candle(1, 121, 85, 100)]; // day 1: high >= 120 target AND low <= 90 stop
    const result = evaluatePrediction(buyPrediction(), candles, 5);
    expect(result.status).toBe("AMBIGUOUS");
    expect(result.targetReached).toBeNull();
    expect(result.stopLossReached).toBeNull();
  });

  it("marks EXPIRED when the full window elapses with neither level reached", () => {
    const candles = [candle(0, 100, 98, 99), candle(1, 102, 99, 101), candle(2, 103, 100, 102)];
    const result = evaluatePrediction(buyPrediction(), candles, 2);
    expect(result.status).toBe("EXPIRED");
  });

  it("marks PENDING when not enough trading days have elapsed yet — never guesses an outcome early", () => {
    const candles = [candle(0, 100, 98, 99), candle(1, 102, 99, 101)];
    const result = evaluatePrediction(buyPrediction(), candles, 10);
    expect(result.status).toBe("PENDING");
  });

  it("returns INSUFFICIENT_DATA when no candle covers the prediction date", () => {
    const candles = [candle(50, 100, 98, 99)]; // all candles are after the prediction date
    const result = evaluatePrediction(buyPrediction({ tradingDate: new Date(0) }), candles, 5);
    expect(result.status).toBe("INSUFFICIENT_DATA");
  });

  it("returns INSUFFICIENT_DATA when the prediction itself has no target or stop-loss", () => {
    const candles = [candle(0, 100, 98, 99), candle(1, 130, 100, 125)];
    const result = evaluatePrediction(buyPrediction({ targetRangeMin: null, stopLoss: null }), candles, 5);
    expect(result.status).toBe("INSUFFICIENT_DATA");
  });
});

describe("evaluatePrediction — SELL (inverse logic)", () => {
  it("hits target when price falls to the target level", () => {
    const sell = buyPrediction({ action: "SELL", targetRangeMax: 90, stopLoss: 110 });
    const candles = [candle(0, 100, 98, 99), candle(1, 95, 88, 89)]; // low <= 90
    const result = evaluatePrediction(sell, candles, 5);
    expect(result.status).toBe("TARGET_HIT");
  });

  it("hits stop-loss when price rises to the stop level", () => {
    const sell = buyPrediction({ action: "REDUCE", targetRangeMax: 90, stopLoss: 110 });
    const candles = [candle(0, 100, 98, 99), candle(1, 112, 100, 111)]; // high >= 110
    const result = evaluatePrediction(sell, candles, 5);
    expect(result.status).toBe("STOP_LOSS_HIT");
  });
});

describe("evaluatePrediction — HOLD", () => {
  it("is NOT_APPLICABLE for target/stop but still reports the actual price move", () => {
    const hold = buyPrediction({ action: "HOLD" });
    const candles = [candle(0, 100, 98, 100), candle(1, 103, 99, 102), candle(2, 105, 101, 104)];
    const result = evaluatePrediction(hold, candles, 5);
    expect(result.status).toBe("NOT_APPLICABLE");
    expect(result.actualReturnPct).toBeCloseTo(4, 5);
  });
});

describe("summarize", () => {
  const base: EvaluatedPrediction = {
    ticker: "TEST",
    action: "BUY",
    score: 70,
    confidence: 80,
    risk: "LOW",
    sector: "IT",
    logicVersion: "v1",
    reasons: [],
    evaluation: { horizon: 5, status: "TARGET_HIT", entryReached: true, targetReached: true, stopLossReached: false, daysToOutcome: 3, highestPrice: 120, lowestPrice: 95, closingPrice: 115, actualReturnPct: 15, note: null },
  };

  it("computes target hit rate only out of resolved (target+stop) predictions, excluding pending", () => {
    const preds: EvaluatedPrediction[] = [
      base,
      { ...base, evaluation: { ...base.evaluation, status: "STOP_LOSS_HIT" } },
      { ...base, evaluation: { ...base.evaluation, status: "PENDING" } },
    ];
    const summary = summarize(preds);
    expect(summary.total).toBe(3);
    expect(summary.targetHitRate).toBeCloseTo(50, 5); // 1 of 2 resolved
    expect(summary.pending).toBe(1);
  });

  it("returns null rates rather than fabricating a rate when nothing has resolved yet", () => {
    const preds: EvaluatedPrediction[] = [{ ...base, evaluation: { ...base.evaluation, status: "PENDING" } }];
    const summary = summarize(preds);
    expect(summary.targetHitRate).toBeNull();
    expect(summary.stopLossRate).toBeNull();
  });
});

describe("evaluateLogicHealth", () => {
  const makeBreakdown = (targetHit: number, stopLossHit: number): ReviewBreakdown => ({
    total: targetHit + stopLossHit,
    targetHit,
    stopLossHit,
    neither: 0,
    pending: 0,
    notApplicable: 0,
    insufficientData: 0,
    ambiguous: 0,
    targetHitRate: (targetHit / (targetHit + stopLossHit)) * 100,
    stopLossRate: (stopLossHit / (targetHit + stopLossHit)) * 100,
    avgReturnPct: null,
    avgScore: null,
    avgConfidence: null,
    avgDaysToTarget: null,
  });

  it("declines to render a verdict when the sample size is too small, rather than guessing", () => {
    const verdict = evaluateLogicHealth(makeBreakdown(5, 2), null);
    expect(verdict.verdict).toBe("INSUFFICIENT_DATA_FOR_DECISION");
  });

  it("says CONTINUE when hit rate is stable with a sufficient sample", () => {
    const current = makeBreakdown(30, 10); // 75%
    const prior = makeBreakdown(28, 12); // 70%
    const verdict = evaluateLogicHealth(current, prior);
    expect(verdict.verdict).toBe("CONTINUE");
  });

  it("says NEEDS_TESTING when hit rate drops by more than the threshold with sufficient samples", () => {
    const current = makeBreakdown(15, 25); // 37.5%
    const prior = makeBreakdown(32, 8); // 80%
    const verdict = evaluateLogicHealth(current, prior);
    expect(verdict.verdict).toBe("NEEDS_TESTING");
  });
});
