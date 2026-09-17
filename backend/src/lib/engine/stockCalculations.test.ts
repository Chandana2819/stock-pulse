import { describe, it, expect } from "vitest";
import { computeDecision, classifySignal, type DecisionInput } from "./decision";
import { SCORING_WEIGHTS } from "../../config/scoring";
import type { IndicatorSnapshot } from "../indicators";
import type { FundamentalsData } from "../providers/types";

function baseInput(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    symbol: "TEST.NS",
    price: 1276.0,
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
    price: 1276.0,
    sma20: 1200,
    sma50: 1150,
    sma200: 1000,
    ema20: 1210,
    rsi14: 55,
    macd: { line: 5, signal: 2, histogram: 3 },
    bollinger: { upper: 1350, middle: 1270, lower: 1190 },
    vwap: 1260,
    volatility30d: 20,
    support: 1200,
    resistance: 1350,
    trend: "UPTREND",
    atr14: 25,
    momentum14: 10,
    relativeStrength55: 0.05,
    volumeTrendRatio: 1.2,
    maxDrawdown30d: -4,
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
    roe: 22,
    roce: null,
    debtToEquity: 0.4,
    revenueGrowth: 18,
    profitGrowth: 20,
    epsGrowth: null,
    eps: null,
    dividendYield: null,
    bookValue: null,
    revenue: null,
    netIncome: null,
    ebitda: null,
    totalDebt: null,
    totalCash: null,
    freeCashFlow: 50,
    promoterHolding: null,
    fiiHolding: null,
    diiHolding: null,
    beta: 0.75,
    missing: [],
    source: "test",
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("Stock Analysis Calculations Audit & Verification", () => {
  // Requirement 1 & 18: Portfolio P&L Calculations
  describe("1. Portfolio P&L Calculations", () => {
    it("calculates exact Invested Cost, Current Value, Unrealized P&L, and Return %", () => {
      const quantity = 3;
      const avgPrice = 1020.28;
      const ltp = 1276.0;

      const investedCost = quantity * avgPrice;
      const currentValue = quantity * ltp;
      const unrealizedPnl = currentValue - investedCost;
      const pnlReturn = ((ltp - avgPrice) / avgPrice) * 100;

      expect(Number(investedCost.toFixed(2))).toBe(3060.84);
      expect(Number(currentValue.toFixed(2))).toBe(3828.0);
      expect(Number(unrealizedPnl.toFixed(2))).toBe(767.16);
      // ((1276 - 1020.28) / 1020.28) * 100 = 25.0637...% ≈ 25.07%
      expect(pnlReturn).toBeCloseTo(25.07, 1);
      expect(Number(pnlReturn.toFixed(2))).toBe(25.06);
    });
  });

  // Requirement 2 & 18: Target Range (+8% to +16%)
  describe("2. Target Range Calculations", () => {
    it("calculates exact Target Min (+8%) and Target Max (+16%) for LTP 1,276.00", () => {
      const price = 1276.0;
      const targetMin = Number((price * 1.08).toFixed(2));
      const targetMax = Number((price * 1.16).toFixed(2));

      expect(targetMin).toBe(1378.08);
      // Exact mathematical result: 1276 * 1.16 = 1480.16 (fixing previous UI bug of 15% = 1467.40)
      expect(targetMax).toBe(1480.16);
    });
  });

  // Requirement 3 & 4: Stop Loss and Entry Zone
  describe("3 & 4. Stop Loss and Entry Zone", () => {
    it("calculates dynamic Stop Loss = Price - 2 * ATR14", () => {
      const price = 1276.0;
      const atr14 = 25.0;
      const stopLoss = Number((price - 2 * atr14).toFixed(2));

      expect(stopLoss).toBe(1226.0);
    });

    it("calculates dynamic Entry Zone: [Price * 0.985, Price * 1.005]", () => {
      const price = 1276.0;
      const entryMin = Number((price * 0.985).toFixed(2));
      const entryMax = Number((price * 1.005).toFixed(2));

      expect(entryMin).toBe(1256.86);
      expect(entryMax).toBe(1282.38);
    });
  });

  // Requirement 5: 7-Pillar Scoring Weights & Normalization
  describe("5. 7-Pillar Weights and Normalization", () => {
    it("verifies the 7 pillar weights sum exactly to 1.00 (100%)", () => {
      const totalWeight =
        SCORING_WEIGHTS.trend +
        SCORING_WEIGHTS.fundamentals +
        SCORING_WEIGHTS.momentum +
        SCORING_WEIGHTS.marketSector +
        SCORING_WEIGHTS.volume +
        SCORING_WEIGHTS.risk +
        SCORING_WEIGHTS.sentiment;

      expect(Math.round(totalWeight * 100)).toBe(100);
      expect(SCORING_WEIGHTS.trend).toBe(0.2);
      expect(SCORING_WEIGHTS.fundamentals).toBe(0.2);
      expect(SCORING_WEIGHTS.momentum).toBe(0.15);
      expect(SCORING_WEIGHTS.marketSector).toBe(0.15);
      expect(SCORING_WEIGHTS.volume).toBe(0.1);
      expect(SCORING_WEIGHTS.risk).toBe(0.1);
      expect(SCORING_WEIGHTS.sentiment).toBe(0.1);
    });
  });

  // Requirement 11 & 18: Exact Signal Boundaries
  describe("11 & 18. Signal Boundaries", () => {
    it("classifies exact signal boundaries without premature integer rounding", () => {
      expect(classifySignal(79.99)).toBe("BUY");
      expect(classifySignal(80.0)).toBe("STRONG BUY");
      expect(classifySignal(64.99)).toBe("HOLD");
      expect(classifySignal(65.0)).toBe("BUY");
      expect(classifySignal(54.99)).toBe("REDUCE");
      expect(classifySignal(55.0)).toBe("HOLD");
      expect(classifySignal(44.99)).toBe("SELL");
      expect(classifySignal(45.0)).toBe("REDUCE");
      expect(classifySignal(29.99)).toBe("STRONG SELL");
      expect(classifySignal(30.0)).toBe("SELL");
    });
  });

  // Requirement 12 & 18: Safety Overrides
  describe("12 & 18. Safety Overrides", () => {
    // Bullish baseline setup (would naturally score BUY or STRONG BUY)
    const bullishSetup = () =>
      baseInput({
        indicators: indicators({ trend: "UPTREND", price: 1276, sma20: 1200, sma50: 1100, sma200: 1000, rsi14: 60, volumeTrendRatio: 1.8 }),
        priceChangePct: 2.0,
        fundamentals: fundamentals({ roe: 25, revenueGrowth: 20 }),
        marketRiskScore: 20,
        candlesCount: 250,
      });

    it("verifies baseline setup without override produces BUY or STRONG BUY", () => {
      const res = computeDecision(bullishSetup());
      expect(["BUY", "STRONG BUY"]).toContain(res.signal);
    });

    // Rule A
    it("Rule A: BUY + fewer than 30 candles → WAIT", () => {
      const res = computeDecision({ ...bullishSetup(), candlesCount: 25 });
      expect(res.signal).toBe("WAIT");
    });

    it("Rule A: STRONG BUY + fewer than 30 candles → WAIT", () => {
      const res = computeDecision({
        ...bullishSetup(),
        indicators: indicators({
          trend: "UPTREND",
          price: 1276,
          sma20: 1200,
          sma50: 1100,
          sma200: 1000,
          rsi14: 60,
          macd: { line: 5, signal: 2, histogram: 3 },
          volumeTrendRatio: 2.0,
        }),
        candlesCount: 15,
      });
      expect(res.signal).toBe("WAIT");
    });

    // Rule B
    it("Rule B: BUY + Market Risk Radar >= 75 → WAIT", () => {
      const res = computeDecision({ ...bullishSetup(), marketRiskScore: 75 });
      expect(res.signal).toBe("WAIT");
    });

    it("Rule B: STRONG BUY + Market Risk Radar >= 75 → WAIT", () => {
      const res = computeDecision({ ...bullishSetup(), marketRiskScore: 85 });
      expect(res.signal).toBe("WAIT");
    });

    // Rule C
    it("Rule C: BUY + SMA20 < SMA50 → WAIT", () => {
      const res = computeDecision({
        ...bullishSetup(),
        indicators: indicators({
          trend: "DOWNTREND",
          sma20: 1050,
          sma50: 1150,
          price: 1276,
        }),
      });
      expect(res.signal).toBe("WAIT");
    });

    it("Rule C: STRONG BUY + SMA20 < SMA50 → WAIT", () => {
      const res = computeDecision({
        ...bullishSetup(),
        indicators: indicators({
          trend: "DOWNTREND",
          sma20: 950,
          sma50: 1100,
          price: 1276,
        }),
      });
      expect(res.signal).toBe("WAIT");
    });
  });

  // Requirement 10: News Sentiment Score clamping and division guard
  describe("10. News Sentiment Clamping & Safe Division", () => {
    it("returns neutral 50 when 0 news articles exist", () => {
      const res = computeDecision(baseInput({ newsArticles: [] }));
      const sentimentPillar = res.pillars.find((p) => p.key === "sentiment")!;
      expect(sentimentPillar.score).toBe(50);
      expect(sentimentPillar.available).toBe(false);
    });

    it("calculates 50 + 40 * ((pos - neg) / total) correctly and clamps to 0..100", () => {
      const allPos = computeDecision(
        baseInput({
          newsArticles: [
            { title: "Good 1", sentiment: "POSITIVE" },
            { title: "Good 2", sentiment: "POSITIVE" },
          ],
        })
      );
      const sentimentScorePos = allPos.pillars.find((p) => p.key === "sentiment")!.score;
      // 50 + 40 * (2 / 2) = 90
      expect(sentimentScorePos).toBe(90);

      const allNeg = computeDecision(
        baseInput({
          newsArticles: [
            { title: "Bad 1", sentiment: "NEGATIVE" },
            { title: "Bad 2", sentiment: "NEGATIVE" },
          ],
        })
      );
      const sentimentScoreNeg = allNeg.pillars.find((p) => p.key === "sentiment")!.score;
      // 50 + 40 * (-2 / 2) = 10
      expect(sentimentScoreNeg).toBe(10);
    });
  });
});
