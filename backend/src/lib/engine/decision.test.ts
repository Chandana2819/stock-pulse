import { describe, it, expect } from "vitest";
import { computeDecision, type DecisionInput } from "./decision";
import { SCORING_WEIGHTS } from "../../config/scoring";
import type { IndicatorSnapshot } from "../indicators";
import type { FundamentalsData } from "../providers/types";

// Baseline "everything neutral / unavailable" input. Individual tests
// override only the fields relevant to what they're checking, so each test
// stays readable and isolated from unrelated pillars.
function baseInput(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    symbol: "TEST.NS",
    price: 100,
    fundamentals: null,
    indicators: null,
    priceChangePct: null,
    marketRiskScore: null,
    sectorChangePct: null,
    newsArticles: [],
    volatility30d: null,
    avgVolume: null,
    volume: null,
    candlesCount: 250,
    ...overrides,
  };
}

function indicators(overrides: Partial<IndicatorSnapshot> = {}): IndicatorSnapshot {
  return {
    price: 100,
    sma20: 100,
    sma50: 100,
    sma200: 100,
    ema20: 100,
    rsi14: 50,
    macd: { line: 0, signal: 0, histogram: 0 },
    bollinger: { upper: 110, middle: 100, lower: 90 },
    vwap: 100,
    volatility30d: 20,
    support: 90,
    resistance: 110,
    trend: "SIDEWAYS",
    atr14: 2,
    momentum14: 0,
    relativeStrength55: 0,
    volumeTrendRatio: 1,
    maxDrawdown30d: -5,
    ...overrides,
  };
}

function fundamentals(overrides: Partial<FundamentalsData> = {}): FundamentalsData {
  return {
    symbol: "TEST.NS",
    name: "Test Co",
    sector: null,
    industry: null,
    country: null,
    marketCap: null,
    peRatio: null,
    forwardPe: null,
    pbRatio: null,
    roe: null,
    roce: null,
    debtToEquity: null,
    revenueGrowth: null,
    profitGrowth: null,
    epsGrowth: null,
    eps: null,
    dividendYield: null,
    bookValue: null,
    revenue: null,
    netIncome: null,
    ebitda: null,
    totalDebt: null,
    totalCash: null,
    freeCashFlow: null,
    promoterHolding: null,
    fiiHolding: null,
    diiHolding: null,
    beta: null,
    missing: [],
    source: "test",
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("computeDecision — pillar scoring", () => {
  it("scores a pillar at neutral (50) and marks it unavailable when its data is missing", () => {
    const result = computeDecision(baseInput());
    const trend = result.pillars.find((p) => p.key === "trend")!;
    const fundamentalsPillar = result.pillars.find((p) => p.key === "fundamentals")!;
    expect(trend.score).toBe(50);
    expect(trend.available).toBe(false);
    expect(fundamentalsPillar.score).toBe(50);
    expect(fundamentalsPillar.available).toBe(false);
  });

  it("scores an uptrend above SMA200 higher than a downtrend below SMA200", () => {
    const bullish = computeDecision(
      baseInput({ indicators: indicators({ trend: "UPTREND", price: 120, sma200: 100 }) })
    );
    const bearish = computeDecision(
      baseInput({ indicators: indicators({ trend: "DOWNTREND", price: 80, sma200: 100 }) })
    );
    const bullTrend = bullish.pillars.find((p) => p.key === "trend")!;
    const bearTrend = bearish.pillars.find((p) => p.key === "trend")!;
    expect(bullTrend.score).toBeGreaterThan(bearTrend.score);
    expect(bullTrend.available).toBe(true);
  });

  it("penalizes overbought RSI (>=75) and oversold RSI (<30) relative to healthy bullish RSI", () => {
    const healthy = computeDecision(baseInput({ indicators: indicators({ rsi14: 60 }) }));
    const overbought = computeDecision(baseInput({ indicators: indicators({ rsi14: 80 }) }));
    const oversold = computeDecision(baseInput({ indicators: indicators({ rsi14: 20 }) }));

    const healthyScore = healthy.pillars.find((p) => p.key === "momentum")!.score;
    const overboughtScore = overbought.pillars.find((p) => p.key === "momentum")!.score;
    const oversoldScore = oversold.pillars.find((p) => p.key === "momentum")!.score;

    expect(healthyScore).toBeGreaterThan(overboughtScore);
    expect(healthyScore).toBeGreaterThan(oversoldScore);
  });

  it("scores high-volume accumulation (rising price) higher than high-volume distribution (falling price)", () => {
    const accumulation = computeDecision(
      baseInput({
        indicators: indicators({ volumeTrendRatio: 2 }),
        priceChangePct: 2,
      })
    );
    const distribution = computeDecision(
      baseInput({
        indicators: indicators({ volumeTrendRatio: 2 }),
        priceChangePct: -2,
      })
    );
    const accScore = accumulation.pillars.find((p) => p.key === "volume")!.score;
    const distScore = distribution.pillars.find((p) => p.key === "volume")!.score;
    expect(accScore).toBeGreaterThan(distScore);
  });

  it("scores strong fundamentals higher than weak fundamentals", () => {
    const strong = computeDecision(
      baseInput({
        fundamentals: fundamentals({ roe: 25, revenueGrowth: 20, profitGrowth: 20, debtToEquity: 0.2, freeCashFlow: 100 }),
      })
    );
    const weak = computeDecision(
      baseInput({
        fundamentals: fundamentals({ roe: 2, revenueGrowth: -10, profitGrowth: -10, debtToEquity: 3, freeCashFlow: -50 }),
      })
    );
    const strongScore = strong.pillars.find((p) => p.key === "fundamentals")!.score;
    const weakScore = weak.pillars.find((p) => p.key === "fundamentals")!.score;
    expect(strongScore).toBeGreaterThan(weakScore);
    expect(strongScore).toBe(100);
    expect(weakScore).toBe(0);
  });

  it("scores all-positive news sentiment higher than all-negative news sentiment", () => {
    const positive = computeDecision(
      baseInput({
        newsArticles: [
          { title: "a", sentiment: "POSITIVE" },
          { title: "b", sentiment: "POSITIVE" },
        ],
      })
    );
    const negative = computeDecision(
      baseInput({
        newsArticles: [
          { title: "a", sentiment: "NEGATIVE" },
          { title: "b", sentiment: "NEGATIVE" },
        ],
      })
    );
    expect(positive.pillars.find((p) => p.key === "sentiment")!.score).toBeGreaterThan(
      negative.pillars.find((p) => p.key === "sentiment")!.score
    );
  });

  it("stock-risk pillar treats LOW volatility/beta as favorable (high score), not risky", () => {
    const lowRisk = computeDecision(
      baseInput({ volatility30d: 15, fundamentals: fundamentals({ beta: 0.5, debtToEquity: 0.3 }) })
    );
    const highRisk = computeDecision(
      baseInput({ volatility30d: 80, fundamentals: fundamentals({ beta: 2.5, debtToEquity: 3 }) })
    );
    const lowRiskScore = lowRisk.pillars.find((p) => p.key === "risk")!.score;
    const highRiskScore = highRisk.pillars.find((p) => p.key === "risk")!.score;
    expect(lowRiskScore).toBeGreaterThan(highRiskScore);
  });

  it("market & sector pillar inverts market risk (higher market risk -> lower pillar score)", () => {
    const calmMarket = computeDecision(baseInput({ marketRiskScore: 10 }));
    const volatileMarket = computeDecision(baseInput({ marketRiskScore: 90 }));
    expect(calmMarket.pillars.find((p) => p.key === "marketSector")!.score).toBeGreaterThan(
      volatileMarket.pillars.find((p) => p.key === "marketSector")!.score
    );
  });
});

describe("computeDecision — final score and signal classification", () => {
  it("computes the final score as the exact weighted sum of pillar scores", () => {
    const input = baseInput({
      indicators: indicators({ trend: "UPTREND", rsi14: 60, volumeTrendRatio: 1.2 }),
      priceChangePct: 1,
      fundamentals: fundamentals({ roe: 20 }),
      newsArticles: [{ title: "a", sentiment: "POSITIVE" }],
      volatility30d: 20,
      marketRiskScore: 40,
      sectorChangePct: 1,
    });
    const result = computeDecision(input);
    const expected = Number(
      (
        result.scores.trend * SCORING_WEIGHTS.trend +
        result.scores.momentum * SCORING_WEIGHTS.momentum +
        result.scores.volume * SCORING_WEIGHTS.volume +
        result.scores.fundamentals * SCORING_WEIGHTS.fundamentals +
        result.scores.sentiment * SCORING_WEIGHTS.sentiment +
        result.scores.risk * SCORING_WEIGHTS.risk +
        result.scores.marketSector * SCORING_WEIGHTS.marketSector
      ).toFixed(2)
    );
    expect(result.scores.final).toBe(expected);
  });

  it("classifies a maximally bullish, high-quality-data input as STRONG BUY", () => {
    const result = computeDecision(
      baseInput({
        indicators: indicators({ trend: "UPTREND", price: 150, sma200: 100, rsi14: 60, macd: { line: 1, signal: 0, histogram: 1 }, volumeTrendRatio: 2 }),
        priceChangePct: 2,
        fundamentals: fundamentals({ roe: 25, revenueGrowth: 20, profitGrowth: 20, debtToEquity: 0.2, freeCashFlow: 100 }),
        newsArticles: [{ title: "a", sentiment: "POSITIVE" }],
        volatility30d: 10,
        marketRiskScore: 10,
        sectorChangePct: 2,
      })
    );
    expect(result.signal).toBe("STRONG BUY");
  });

  it("classifies a maximally bearish, high-quality-data input as STRONG SELL", () => {
    const result = computeDecision(
      baseInput({
        indicators: indicators({ trend: "DOWNTREND", price: 70, sma200: 100, rsi14: 20, macd: { line: -1, signal: 0, histogram: -1 }, volumeTrendRatio: 2 }),
        priceChangePct: -2,
        fundamentals: fundamentals({ roe: 1, revenueGrowth: -10, profitGrowth: -10, debtToEquity: 3, freeCashFlow: -100 }),
        newsArticles: [{ title: "a", sentiment: "NEGATIVE" }],
        volatility30d: 90,
        marketRiskScore: 90,
        sectorChangePct: -2,
      })
    );
    expect(result.signal).toBe("STRONG SELL");
  });

  it("classifies a fully neutral input (all pillars at 50, the scale's exact midpoint) as HOLD", () => {
    // The HOLD band now starts at 50 (recalibrated in classifySignal), so a
    // stock the engine has no real signal on (every pillar unavailable,
    // defaulted to neutral 50) reads as a neutral HOLD rather than the mild,
    // unwarranted sell recommendation this used to produce.
    const result = computeDecision(baseInput());
    expect(result.scores.final).toBe(50);
    expect(result.signal).toBe("HOLD");
  });
});

describe("computeDecision — safety overrides", () => {
  it("Rule A: forces WAIT when candle history is under 30 days, regardless of score", () => {
    const result = computeDecision(
      baseInput({
        candlesCount: 10,
        indicators: indicators({ trend: "UPTREND", price: 150, sma200: 100, rsi14: 60 }),
        fundamentals: fundamentals({ roe: 25 }),
      })
    );
    expect(result.signal).toBe("WAIT");
    expect(result.reasons[0]).toMatch(/insufficient/i);
  });

  it("Rule B: downgrades a BUY/STRONG BUY to WAIT when market risk is >= 75", () => {
    const bullishInput = baseInput({
      indicators: indicators({ trend: "UPTREND", price: 130, sma200: 100, rsi14: 60, volumeTrendRatio: 1.6 }),
      priceChangePct: 2,
      fundamentals: fundamentals({ roe: 20, revenueGrowth: 15 }),
      marketRiskScore: 75,
    });
    const result = computeDecision(bullishInput);
    // Sanity check: the same setup without elevated market risk should have been a BUY-tier score.
    const withoutRiskOverride = computeDecision({ ...bullishInput, marketRiskScore: 10 });
    expect(["BUY", "STRONG BUY"]).toContain(withoutRiskOverride.signal);

    expect(result.signal).toBe("WAIT");
    expect(result.warnings.some((w) => w.includes("elevated broad market volatility"))).toBe(true);
  });

  it("Rule C: keeps a BUY/STRONG BUY (with a warning) on a mild downtrend", () => {
    // Strong fundamentals/momentum/sentiment push the score into BUY territory;
    // the trend pillar is bearish (DOWNTREND) but RSI/MACD aren't oversold, so
    // this is a mild downtrend — Rule C warns instead of hard-blocking.
    const input = baseInput({
      indicators: indicators({ trend: "DOWNTREND", price: 80, sma200: 100, rsi14: 60, macd: { line: 1, signal: 0, histogram: 1 }, volumeTrendRatio: 1.6 }),
      priceChangePct: 2,
      fundamentals: fundamentals({ roe: 25, revenueGrowth: 20, profitGrowth: 20, debtToEquity: 0.2, freeCashFlow: 100 }),
      newsArticles: [{ title: "a", sentiment: "POSITIVE" }],
      marketRiskScore: 10,
      sectorChangePct: 2,
    });
    const result = computeDecision(input);
    expect(["BUY", "STRONG BUY"]).toContain(result.signal);
    expect(result.warnings.some((w) => w.includes("50-day moving average"))).toBe(true);
  });

  it("Rule C: downgrades a BUY/STRONG BUY to WAIT on a severe downtrend (RSI < 35 + negative MACD)", () => {
    const input = baseInput({
      indicators: indicators({ trend: "DOWNTREND", price: 80, sma200: 100, rsi14: 34, macd: { line: -1, signal: -0.5, histogram: -0.1 }, volumeTrendRatio: 1.6 }),
      priceChangePct: 2,
      fundamentals: fundamentals({ roe: 25, revenueGrowth: 20, profitGrowth: 20, debtToEquity: 0.2, freeCashFlow: 100 }),
      newsArticles: [{ title: "a", sentiment: "POSITIVE" }],
      marketRiskScore: 10,
      sectorChangePct: 2,
    });
    const result = computeDecision(input);
    expect(result.signal).toBe("WAIT");
    expect(result.warnings.some((w) => w.includes("downtrend"))).toBe(true);
  });

  it("does not override a HOLD/SELL signal just because market risk is elevated", () => {
    const result = computeDecision(baseInput({ marketRiskScore: 90 }));
    // All other pillars neutral (50) + a low market/sector pillar drags this
    // below HOLD; either way it must not be forced to WAIT by Rule B, which
    // only fires for BUY/STRONG BUY.
    expect(result.signal).not.toBe("WAIT");
  });
});

describe("computeDecision — confidence and data quality", () => {
  it("reports EXCELLENT data quality when indicators, fundamentals, news, and candle history are all present", () => {
    const result = computeDecision(
      baseInput({
        indicators: indicators(),
        fundamentals: fundamentals({ roe: 15 }),
        newsArticles: [{ title: "a", sentiment: "NEUTRAL" }],
        candlesCount: 250,
      })
    );
    expect(result.dataQuality).toBe("EXCELLENT");
    expect(result.dataQualityScore).toBe(100);
  });

  it("reports INSUFFICIENT data quality and forces WAIT when everything is missing", () => {
    const result = computeDecision(baseInput({ candlesCount: 5, indicators: null, fundamentals: null, newsArticles: [] }));
    expect(result.dataQuality).toBe("INSUFFICIENT");
    expect(result.signal).toBe("WAIT");
  });

  it("gives higher confidence when all pillars agree than when they sharply disagree", () => {
    // Every pillar pushed the same direction (bullish) — should agree closely.
    const agreeing = computeDecision(
      baseInput({
        indicators: indicators({ trend: "UPTREND", price: 130, sma200: 100, rsi14: 60, volumeTrendRatio: 1.6 }),
        priceChangePct: 2,
        fundamentals: fundamentals({ roe: 20, revenueGrowth: 15 }),
        newsArticles: [{ title: "a", sentiment: "POSITIVE" }],
        volatility30d: 15,
        marketRiskScore: 15,
        sectorChangePct: 2,
      })
    );
    // Trend/momentum maximally bullish but fundamentals/risk maximally bearish — pillars disagree sharply.
    const disagreeing = computeDecision(
      baseInput({
        indicators: indicators({ trend: "UPTREND", price: 150, sma200: 100, rsi14: 60, volumeTrendRatio: 2 }),
        priceChangePct: 2,
        fundamentals: fundamentals({ roe: 1, revenueGrowth: -10, profitGrowth: -10, debtToEquity: 3, freeCashFlow: -100, beta: 2.5 }),
        newsArticles: [{ title: "a", sentiment: "NEGATIVE" }],
        volatility30d: 90,
        marketRiskScore: 15,
        sectorChangePct: 2,
      })
    );
    expect(agreeing.confidence).toBeGreaterThan(disagreeing.confidence);
  });
});

describe("computeDecision — synthesis", () => {
  it("names the supporting pillars for a BUY-tier signal", () => {
    const result = computeDecision(
      baseInput({
        indicators: indicators({ trend: "UPTREND", price: 130, sma200: 100, rsi14: 60 }),
        priceChangePct: 1,
        fundamentals: fundamentals({ roe: 25, revenueGrowth: 20 }),
        marketRiskScore: 20,
      })
    );
    expect(["BUY", "STRONG BUY"]).toContain(result.signal);
    expect(result.synthesis).toMatch(new RegExp(result.signal));
    // Should name at least one of the genuinely bullish pillars, not just restate the signal.
    expect(result.synthesis).toMatch(/Trend|Fundamentals|Momentum/);
  });

  it("names the dragging pillars for a SELL-tier signal", () => {
    const result = computeDecision(
      baseInput({
        indicators: indicators({ trend: "DOWNTREND", price: 70, sma200: 100, rsi14: 20 }),
        priceChangePct: -2,
        fundamentals: fundamentals({ roe: 1, revenueGrowth: -10, profitGrowth: -10, debtToEquity: 3 }),
        marketRiskScore: 80,
      })
    );
    expect(["SELL", "STRONG SELL", "REDUCE"]).toContain(result.signal);
    expect(result.synthesis).toMatch(/working against|Rated/);
  });

  it("rephrases the override warning instead of leaving reasons[] looking contradictory when a severe downtrend caps a would-be BUY", () => {
    const result = computeDecision(
      baseInput({
        indicators: indicators({ trend: "DOWNTREND", price: 80, sma200: 100, rsi14: 34, macd: { line: -1, signal: -0.5, histogram: -0.1 }, volumeTrendRatio: 1.6 }),
        priceChangePct: 2,
        fundamentals: fundamentals({ roe: 25, revenueGrowth: 20, profitGrowth: 20, debtToEquity: 0.2, freeCashFlow: 100 }),
        newsArticles: [{ title: "a", sentiment: "POSITIVE" }],
        marketRiskScore: 10,
        sectorChangePct: 2,
      })
    );
    expect(result.signal).toBe("WAIT");
    expect(result.synthesis).toMatch(/otherwise be a BUY/);
    expect(result.synthesis).toMatch(/downtrend/);
  });

  it("frames a fully neutral input as insufficient data, not a false BUY/SELL narrative", () => {
    const result = computeDecision(baseInput({ candlesCount: 5 }));
    expect(result.dataQuality).toBe("INSUFFICIENT");
    expect(result.synthesis).toMatch(/isn't enough reliable data/i);
  });

  it("still produces a coherent sentence for a fully neutral input with no bullish or bearish pillars to name", () => {
    const result = computeDecision(baseInput());
    // Neutral input lands on REDUCE per the documented band asymmetry test
    // above, with no pillar extreme enough to name — the synthesis should
    // fall back to something coherent rather than an empty/malformed string.
    expect(result.synthesis.length).toBeGreaterThan(10);
    expect(result.synthesis).toMatch(new RegExp(result.signal));
  });
});
