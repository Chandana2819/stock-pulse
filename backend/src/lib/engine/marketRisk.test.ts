import { describe, it, expect } from "vitest";
import { computeMarketRisk, type MarketRiskInput } from "./marketRisk";

function baseInput(overrides: Partial<MarketRiskInput> = {}): MarketRiskInput {
  return {
    niftyChange: null,
    sensexChange: null,
    bankNiftyChange: null,
    indiaVix: null,
    spxChange: null,
    nasdaqChange: null,
    dowChange: null,
    ...overrides,
  };
}

describe("computeMarketRisk — factor availability", () => {
  it("marks a factor unavailable when its inputs are missing", () => {
    const result = computeMarketRisk(baseInput());
    const indexTrend = result.factors.find((f) => f.key === "indexTrend")!;
    expect(indexTrend.available).toBe(false);
    expect(indexTrend.score).toBeNull();
  });

  it("computes the index trend factor from the average of NIFTY/SENSEX", () => {
    const result = computeMarketRisk(baseInput({ niftyChange: -1, sensexChange: -1 }));
    const indexTrend = result.factors.find((f) => f.key === "indexTrend")!;
    expect(indexTrend.available).toBe(true);
    expect(indexTrend.score).not.toBeNull();
  });
});

describe("computeMarketRisk — directional correctness", () => {
  it("scores a falling market as higher risk than a rising market", () => {
    const falling = computeMarketRisk(baseInput({ niftyChange: -3, sensexChange: -3 }));
    const rising = computeMarketRisk(baseInput({ niftyChange: 3, sensexChange: 3 }));
    expect(falling.score).toBeGreaterThan(rising.score);
  });

  it("scores high India VIX as higher risk than low India VIX", () => {
    const calm = computeMarketRisk(baseInput({ indiaVix: 11 }));
    const volatile = computeMarketRisk(baseInput({ indiaVix: 35 }));
    expect(volatile.score).toBeGreaterThan(calm.score);
  });

  it("scores weak global markets as higher risk than strong global markets", () => {
    const weak = computeMarketRisk(baseInput({ spxChange: -2, nasdaqChange: -2, dowChange: -2 }));
    const strong = computeMarketRisk(baseInput({ spxChange: 2, nasdaqChange: 2, dowChange: 2 }));
    expect(weak.score).toBeGreaterThan(strong.score);
  });

  it("scores negative net institutional (FII/DII) outflows as higher risk than inflows", () => {
    const outflow = computeMarketRisk(baseInput({ fiiNetFlow: -2000, diiNetFlow: 0 }));
    const inflow = computeMarketRisk(baseInput({ fiiNetFlow: 2000, diiNetFlow: 0 }));
    expect(outflow.score).toBeGreaterThan(inflow.score);
  });

  it("scores more declining stocks than advancing as higher risk", () => {
    const bearishBreadth = computeMarketRisk(baseInput({ advances: 100, declines: 400 }));
    const bullishBreadth = computeMarketRisk(baseInput({ advances: 400, declines: 100 }));
    expect(bearishBreadth.score).toBeGreaterThan(bullishBreadth.score);
  });
});

describe("computeMarketRisk — classification bands", () => {
  it("classifies a fully calm market as LOW or VERY LOW risk", () => {
    const result = computeMarketRisk(
      baseInput({
        niftyChange: 2,
        sensexChange: 2,
        bankNiftyChange: 2,
        indiaVix: 11,
        spxChange: 2,
        nasdaqChange: 2,
        dowChange: 2,
        advances: 400,
        declines: 100,
        fiiNetFlow: 2000,
        diiNetFlow: 1000,
        niftyMomentum: 10,
      })
    );
    expect(["VERY LOW RISK", "LOW RISK"]).toContain(result.classification);
    expect(result.score).toBeLessThanOrEqual(40);
  });

  it("classifies a fully stressed market as HIGH or VERY HIGH risk", () => {
    const result = computeMarketRisk(
      baseInput({
        niftyChange: -3,
        sensexChange: -3,
        bankNiftyChange: -3,
        indiaVix: 35,
        spxChange: -3,
        nasdaqChange: -3,
        dowChange: -3,
        advances: 100,
        declines: 400,
        fiiNetFlow: -3000,
        diiNetFlow: -1000,
        niftyMomentum: 95,
      })
    );
    expect(["HIGH", "VERY HIGH"]).toContain(result.classification);
    expect(result.score).toBeGreaterThanOrEqual(60);
  });

  it("documents actual no-data behavior: breadth/FII-DII fallbacks skew the score to HIGH, not neutral", () => {
    // Breadth and FII/DII both synthesize a "slightly bearish default" (score
    // 65) per their own code comments when no real input is available, and
    // niftyMomentum falls back to a neutral 50 — the weighted blend of those
    // three usable-but-synthetic factors lands at 61, just past the HIGH
    // threshold (>60). So "no market data at all" reads as HIGH risk, not a
    // neutral 50 — worth knowing if this ever surfaces to a user before the
    // scanner has run.
    const result = computeMarketRisk(baseInput());
    expect(result.classification).toBe("HIGH");
    expect(result.score).toBeGreaterThan(60);
  });
});

describe("computeMarketRisk — reasons", () => {
  it("includes a declining-Nifty reason when Nifty is down more than 0.4%", () => {
    const result = computeMarketRisk(baseInput({ niftyChange: -1 }));
    expect(result.reasons.some((r) => r.toLowerCase().includes("nifty index is declining"))).toBe(true);
  });

  it("falls back to a generic stable reason when nothing stands out", () => {
    const result = computeMarketRisk(baseInput({ niftyChange: 0.1, indiaVix: 12 }));
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
