import { describe, it, expect } from "vitest";
import { diagnosePortfolioLoss, evaluateCrashRisk, type HoldingDiagnostic } from "./lossDiagnostic";

describe("evaluateCrashRisk", () => {
  it("classifies calm VIX below 14 as low crash probability", () => {
    const res = evaluateCrashRisk({ indiaVix: 13.5, niftyDayChange: 0.5 });
    expect(res.vixStatus).toBe("CALM");
    expect(res.crashProbabilityPct).toBeLessThan(20);
    expect(res.marketPhase).toBe("HEALTHY_CORRECTION");
  });

  it("classifies elevated VIX (22) as normal correction / moderate", () => {
    const res = evaluateCrashRisk({ indiaVix: 22.0, niftyDayChange: -0.8 });
    expect(res.vixStatus).toBe("HIGH_VOLATILITY");
    expect(res.crashProbabilityPct).toBeGreaterThanOrEqual(40);
  });

  it("classifies panic VIX (>26) as severe risk", () => {
    const res = evaluateCrashRisk({ indiaVix: 29.5, niftyDayChange: -2.5 });
    expect(res.vixStatus).toBe("PANIC");
    expect(res.crashProbabilityPct).toBeGreaterThanOrEqual(75);
    expect(res.marketPhase).toBe("SYSTEMIC_CRASH_RISK");
  });
});

describe("diagnosePortfolioLoss with real user portfolio scenario", () => {
  const sampleHoldings: HoldingDiagnostic[] = [
    {
      stock: "BEL.NS",
      displaySym: "BEL",
      quantity: 24,
      avgPrice: 450.54,
      currentPrice: 388.05,
      cost: 10813.0,
      value: 9313.2,
      pl: -1499.8,
      plPct: -13.87,
    },
    {
      stock: "ONGC.NS",
      displaySym: "ONGC",
      quantity: 31,
      avgPrice: 274.22,
      currentPrice: 235.14,
      cost: 8501.05,
      value: 7289.34,
      pl: -1211.71,
      plPct: -14.25,
    },
    {
      stock: "INFY.NS",
      displaySym: "INFY",
      quantity: 1,
      avgPrice: 1298.3,
      currentPrice: 1062.2,
      cost: 1298.3,
      value: 1062.2,
      pl: -236.1,
      plPct: -18.19,
    },
    {
      stock: "COALINDIA.NS",
      displaySym: "COALINDIA",
      quantity: 5,
      avgPrice: 460.74,
      currentPrice: 422.55,
      cost: 2303.7,
      value: 2112.75,
      pl: -190.95,
      plPct: -8.29,
    },
    {
      stock: "RELIANCE.NS",
      displaySym: "RELIANCE",
      quantity: 2,
      avgPrice: 1336.35,
      currentPrice: 1251.8,
      cost: 2672.7,
      value: 2503.6,
      pl: -169.1,
      plPct: -6.33,
    },
    {
      stock: "TATAPOWER.NS",
      displaySym: "TATAPOWER",
      quantity: 4,
      avgPrice: 395.85,
      currentPrice: 362.25,
      cost: 1583.4,
      value: 1449.0,
      pl: -134.4,
      plPct: -8.49,
    },
    {
      stock: "IRFC.NS",
      displaySym: "IRFC",
      quantity: 2,
      avgPrice: 100.75,
      currentPrice: 79.23,
      cost: 201.5,
      value: 158.46,
      pl: -43.04,
      plPct: -21.36,
    },
    {
      stock: "ADANIGREEN.NS",
      displaySym: "ADANIGREEN",
      quantity: 3,
      avgPrice: 1020.2,
      currentPrice: 1271.8,
      cost: 3060.6,
      value: 3815.4,
      pl: 754.8,
      plPct: 24.66,
    },
    {
      stock: "MON100.NS",
      displaySym: "MON100",
      quantity: 6,
      avgPrice: 247.28,
      currentPrice: 326.69,
      cost: 1483.7,
      value: 1960.14,
      pl: 476.44,
      plPct: 32.11,
    },
    {
      stock: "MASPTOP50.NS",
      displaySym: "MASPTOP50",
      quantity: 6,
      avgPrice: 75.0,
      currentPrice: 97.79,
      cost: 450.0,
      value: 586.74,
      pl: 136.74,
      plPct: 30.39,
    },
    {
      stock: "TATAGOLD.NS",
      displaySym: "TATAGOLD",
      quantity: 102,
      avgPrice: 14.61,
      currentPrice: 14.66,
      cost: 1490.91,
      value: 1495.32,
      pl: 4.41,
      plPct: 0.3,
    },
  ];

  it("accurately attributes losses to BEL and ONGC", () => {
    const diagnosis = diagnosePortfolioLoss({
      holdings: sampleHoldings,
      niftyDayChange: 0.52,
      indiaVix: 14.2,
    });

    expect(diagnosis.isInLoss).toBe(true);
    expect(diagnosis.lossDrivers.length).toBe(7);
    expect(diagnosis.profitBuffers.length).toBe(4);

    // BEL and ONGC are the top 2 drags
    expect(diagnosis.lossDrivers[0].symbol).toBe("BEL");
    expect(diagnosis.lossDrivers[1].symbol).toBe("ONGC");

    // Over-concentration flagged
    expect(diagnosis.concentrationRisk.isOverConcentrated).toBe(true);
    expect(diagnosis.concentrationRisk.top2LossPctOfCapital).toBeGreaterThan(50);
    expect(diagnosis.concentrationRisk.top2LossSymbols).toEqual(["BEL", "ONGC"]);

    // Benchmark divergence noted
    expect(diagnosis.benchmark.dayChangePct).toBe(0.52);
    expect(diagnosis.benchmark.divergencePct).toBeLessThan(0);
    expect(diagnosis.benchmark.explanation).toContain("NOT a broad market crash");

    // Crash probability is low
    expect(diagnosis.crashRadar.crashProbabilityPct).toBeLessThan(25);
  });
});
