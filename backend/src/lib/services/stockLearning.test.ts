import { describe, it, expect } from "vitest";
import {
  computeMonthlyOverview,
  computeSignalJourney,
  computeScoreConfidenceMovement,
  computeReasonsAnalysis,
  computeWarningsAnalysis,
  computeEntryStopTargetEvolution,
  computeRiskReview,
  computeChangeSummary,
  computeHistoricalValidation,
  computeWhatToMonitor,
  buildMasterMonthlyReview,
  UNAVAILABLE,
  type DailySignalRow,
} from "./stockLearning";

function row(day: number, overrides: Partial<DailySignalRow> = {}): DailySignalRow {
  return {
    tradingDate: new Date(Date.UTC(2026, 8, day)), // September 2026
    price: 100 + day,
    signal: "HOLD",
    score: 60,
    confidence: 70,
    risk: "LOW",
    entryZoneMin: null,
    entryZoneMax: null,
    stopLoss: 90,
    targetRangeMin: 110,
    targetRangeMax: 120,
    reasons: [],
    warnings: [],
    rsi: null,
    macd: null,
    trend: null,
    volume: null,
    ...overrides,
  };
}

describe("computeMonthlyOverview", () => {
  it("computes stock return, my return and holding P&L from real rows", () => {
    const rows = [row(1, { price: 100 }), row(15, { price: 110 }), row(30, { price: 120 })];
    const overview = computeMonthlyOverview(rows, 9, 2026, { avgPrice: 90, quantity: 10 });
    expect(overview.tradingDays).toBe(3);
    expect(overview.stockReturnPct).toBeCloseTo(20, 5);
    expect(overview.myReturnPct).toBeCloseTo(((120 - 100) / 90) * 100, 5);
    expect(overview.investedValue).toBe(900);
    expect(overview.currentValue).toBe(1200);
    expect(overview.pl).toBe(300);
  });

  it("never fabricates a holding when none is on record", () => {
    const overview = computeMonthlyOverview([row(1), row(2)], 9, 2026, null);
    expect(overview.investedValue).toBeNull();
    expect(overview.myReturnPct).toBeNull();
  });

  it("counts signal and risk changes", () => {
    const rows = [
      row(1, { signal: "BUY", risk: "LOW" }),
      row(2, { signal: "BUY", risk: "LOW" }),
      row(3, { signal: "HOLD", risk: "MODERATE" }),
      row(4, { signal: "SELL", risk: "MODERATE" }),
    ];
    const overview = computeMonthlyOverview(rows, 9, 2026, null);
    expect(overview.signalChanges).toBe(2);
    expect(overview.riskChanges).toBe(1);
    expect(overview.mostFrequentSignal).toBe("BUY");
    expect(overview.currentRisk).toBe("MODERATE");
    expect(overview.previousRisk).toBe("LOW");
  });
});

describe("computeSignalJourney", () => {
  it("builds a full daily timeline with counts", () => {
    const rows = [row(1, { signal: "BUY" }), row(2, { signal: "BUY" }), row(3, { signal: "HOLD" })];
    const journey = computeSignalJourney(rows);
    expect(journey.timeline).toHaveLength(3);
    expect(journey.counts).toEqual({ BUY: 2, HOLD: 1 });
    expect(journey.firstSignal).toBe("BUY");
    expect(journey.lastSignal).toBe("HOLD");
    expect(journey.signalChanges).toBe(1);
  });
});

describe("computeScoreConfidenceMovement", () => {
  it("reports start, end, high, low and change without inventing missing values", () => {
    const rows = [row(1, { score: 60, confidence: null }), row(2, { score: 70, confidence: 80 })];
    const { score, confidence } = computeScoreConfidenceMovement(rows);
    expect(score.start).toBe(60);
    expect(score.end).toBe(70);
    expect(score.change).toBe(10);
    expect(confidence.start).toBe(80); // first non-null value, since day 1 had none
    expect(confidence.series[0].value).toBeNull();
  });
});

describe("computeReasonsAnalysis", () => {
  it("aggregates exact reason text frequency and classifies sentiment", () => {
    const rows = [
      row(1, { reasons: ["Technical price trend is in a clear uptrend (SMA20 > SMA50)", "High revenue growth +16%"] }),
      row(2, { reasons: ["Technical price trend is in a clear uptrend (SMA20 > SMA50)"] }),
      row(3, { reasons: ["Technical price trend is in a downtrend (SMA20 < SMA50)"] }),
    ];
    const result = computeReasonsAnalysis(rows);
    expect(result.positive.find((p) => p.text.includes("uptrend"))?.days).toBe(2);
    expect(result.negative.find((n) => n.text.includes("downtrend"))?.days).toBe(1);
  });

  it("returns empty buckets rather than inventing reasons when none were uploaded", () => {
    const result = computeReasonsAnalysis([row(1, { reasons: [] }), row(2, { reasons: [] })]);
    expect(result.positive).toEqual([]);
    expect(result.negative).toEqual([]);
  });
});

describe("computeWarningsAnalysis", () => {
  it("flags no warnings recorded when none exist", () => {
    const result = computeWarningsAnalysis([row(1, { warnings: [] }), row(2, { warnings: [] })]);
    expect(result.hasAnyWarnings).toBe(false);
    expect(result.current).toEqual([]);
  });

  it("detects a new warning appearing only in the second half of the month", () => {
    const rows = [
      row(1, { warnings: [] }),
      row(2, { warnings: [] }),
      row(3, { warnings: ["RSI approaching overbought"] }),
      row(4, { warnings: ["RSI approaching overbought"] }),
    ];
    const result = computeWarningsAnalysis(rows);
    expect(result.newThisMonth).toContain("RSI approaching overbought");
    expect(result.current).toEqual(["RSI approaching overbought"]);
  });
});

describe("computeEntryStopTargetEvolution", () => {
  it("tracks stop-loss and target changes across the month", () => {
    const rows = [row(1, { stopLoss: 90, targetRangeMax: 120 }), row(15, { stopLoss: 95, targetRangeMax: 125 })];
    const result = computeEntryStopTargetEvolution(rows);
    expect(result.summary.some((s) => s.includes("Stop-loss moved from ₹90.00 to ₹95.00"))).toBe(true);
  });

  it("reports unavailable when no entry/stop/target data was ever uploaded", () => {
    const rows = [row(1, { stopLoss: null, entryZoneMin: null, targetRangeMin: null })];
    const result = computeEntryStopTargetEvolution(rows);
    expect(result.summary).toEqual([UNAVAILABLE]);
  });
});

describe("computeChangeSummary", () => {
  it("flags improvement, weakening and stability across two real months", () => {
    const prevRows = [row(1, { score: 60, confidence: 65, risk: "HIGH", signal: "SELL" }), row(2, { score: 60, confidence: 65, risk: "HIGH", signal: "HOLD" })];
    const currRows = [row(1, { score: 75, confidence: 80, risk: "LOW", signal: "BUY" }), row(2, { score: 75, confidence: 80, risk: "LOW", signal: "BUY" })];
    const prevOverview = computeMonthlyOverview(prevRows, 8, 2026, null);
    const currOverview = computeMonthlyOverview(currRows, 9, 2026, null);
    const prevWarnings = computeWarningsAnalysis(prevRows);
    const currWarnings = computeWarningsAnalysis(currRows);
    const summary = computeChangeSummary(currOverview, prevOverview, currWarnings, prevWarnings);
    expect(summary.improved.some((s) => s.includes("score increased"))).toBe(true);
    expect(summary.improved.some((s) => s.includes("Risk moved from HIGH to LOW"))).toBe(true);
  });

  it("states plainly there is no previous month, rather than fabricating a comparison", () => {
    const overview = computeMonthlyOverview([row(1)], 9, 2026, null);
    const warnings = computeWarningsAnalysis([row(1)]);
    const summary = computeChangeSummary(overview, null, warnings, null);
    expect(summary.improved[0]).toMatch(/No previous month/);
    expect(summary.weakened[0]).toMatch(/No previous month/);
    expect(summary.stable[0]).toMatch(/No previous month/);
  });
});

describe("computeHistoricalValidation", () => {
  it("computes average forward returns after BUY signals using only uploaded prices", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row(i + 1, { price: 100 + i * 2, signal: i < 6 ? "BUY" : "HOLD" })
    );
    const result = computeHistoricalValidation(rows);
    const h5 = result.buy.find((b) => b.horizon === 5)!;
    expect(h5.sampleSize).toBeGreaterThan(0);
    expect(h5.avgReturnPct).not.toBeNull();
  });

  it("declines to fabricate a result when there is no uploaded price history", () => {
    const rows = [row(1, { price: null }), row(2, { price: null })];
    const result = computeHistoricalValidation(rows);
    expect(result.note).not.toBeNull();
    expect(result.buy.every((b) => b.avgReturnPct === null)).toBe(true);
  });
});

describe("computeWhatToMonitor", () => {
  it("derives measurable monitoring points from real stored levels", () => {
    const overview = computeMonthlyOverview([row(1, { score: 70, confidence: 75 })], 9, 2026, null);
    const warnings = computeWarningsAnalysis([row(1)]);
    const evolution = computeEntryStopTargetEvolution([row(1, { stopLoss: 90, targetRangeMax: 120 })]);
    const points = computeWhatToMonitor(overview, warnings, evolution);
    expect(points.some((p) => p.includes("stop-loss"))).toBe(true);
    expect(points.some((p) => p.includes("target range"))).toBe(true);
  });

  it("admits insufficient data rather than inventing a monitoring point", () => {
    const overview = computeMonthlyOverview([], 9, 2026, null);
    const warnings = computeWarningsAnalysis([]);
    const evolution = computeEntryStopTargetEvolution([]);
    const points = computeWhatToMonitor(overview, warnings, evolution);
    expect(points).toEqual(["Not enough uploaded data yet to generate specific monitoring points — keep uploading daily files."]);
  });
});

describe("buildMasterMonthlyReview", () => {
  it("states the exact number of available trading days", () => {
    const rows = [row(1), row(2), row(3)];
    const overview = computeMonthlyOverview(rows, 9, 2026, null);
    const journey = computeSignalJourney(rows);
    const changes = computeChangeSummary(overview, null, computeWarningsAnalysis(rows), null);
    const review = buildMasterMonthlyReview(overview, journey, changes, ["test"]);
    expect(review.tradingDaysNote).toContain("3 available trading day");
  });
});
