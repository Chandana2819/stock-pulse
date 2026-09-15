import { describe, it, expect } from "vitest";
import {
  cagr,
  xirr,
  sipFutureValue,
  lumpsumFutureValue,
  requiredMonthlySip,
  inflationAdjusted,
  scenarioBand,
  financialYear,
  financialYearRange,
  round,
  type CashFlow,
} from "./finance";

describe("cagr", () => {
  it("computes standard compound growth", () => {
    // 100 -> 200 over 1 year is a straightforward 100% CAGR.
    expect(cagr(100, 200, 1)).toBeCloseTo(100, 5);
  });

  it("returns null for non-positive or invalid inputs", () => {
    expect(cagr(0, 100, 1)).toBeNull();
    expect(cagr(-50, 100, 1)).toBeNull();
    expect(cagr(100, 200, 0)).toBeNull();
    expect(cagr(100, -1, 1)).toBeNull();
  });
});

describe("xirr", () => {
  it("returns null with fewer than 2 cash flows", () => {
    expect(xirr([])).toBeNull();
    expect(xirr([{ date: new Date(), amount: -100 }])).toBeNull();
  });

  it("returns null when all flows are the same sign (no real return to solve for)", () => {
    const flows: CashFlow[] = [
      { date: new Date("2024-01-01"), amount: -100 },
      { date: new Date("2024-06-01"), amount: -50 },
    ];
    expect(xirr(flows)).toBeNull();
  });

  it("solves a simple known case: invest 100, get back 110 exactly one year later (~10%)", () => {
    const flows: CashFlow[] = [
      { date: new Date("2023-01-01"), amount: -100 },
      { date: new Date("2024-01-01"), amount: 110 },
    ];
    const result = xirr(flows);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(10, 0);
  });

  it("solves a double-your-money-in-a-year case (~100%)", () => {
    const flows: CashFlow[] = [
      { date: new Date("2023-01-01"), amount: -1000 },
      { date: new Date("2024-01-01"), amount: 2000 },
    ];
    const result = xirr(flows);
    expect(result!).toBeCloseTo(100, 0);
  });
});

describe("sipFutureValue", () => {
  it("invested total equals monthly * months with no step-up", () => {
    const { invested } = sipFutureValue(1000, 12, 1, 0);
    expect(invested).toBe(12000);
  });

  it("future value exceeds invested amount for a positive return", () => {
    const { futureValue, invested, gain } = sipFutureValue(5000, 12, 5, 0);
    expect(futureValue).toBeGreaterThan(invested);
    expect(gain).toBeCloseTo(futureValue - invested, 5);
  });

  it("step-up increases total invested vs. no step-up over multiple years", () => {
    const flat = sipFutureValue(1000, 10, 3, 0);
    const steppedUp = sipFutureValue(1000, 10, 3, 10);
    expect(steppedUp.invested).toBeGreaterThan(flat.invested);
  });
});

describe("lumpsumFutureValue", () => {
  it("compounds a lump sum correctly", () => {
    const { futureValue, invested, gain } = lumpsumFutureValue(1000, 10, 2);
    // 1000 * 1.1^2 = 1210
    expect(futureValue).toBeCloseTo(1210, 5);
    expect(invested).toBe(1000);
    expect(gain).toBeCloseTo(210, 5);
  });
});

describe("requiredMonthlySip", () => {
  it("returns 0 when the current corpus alone already meets the target", () => {
    const result = requiredMonthlySip(1000, 10, 5, 1_000_000);
    expect(result).toBe(0);
  });

  it("returns null for a non-positive time horizon", () => {
    expect(requiredMonthlySip(100000, 10, 0)).toBeNull();
  });

  it("returns a positive contribution that actually reaches the target", () => {
    const target = 1_000_000;
    const years = 10;
    const annualReturn = 12;
    const sip = requiredMonthlySip(target, annualReturn, years);
    expect(sip).not.toBeNull();
    expect(sip!).toBeGreaterThan(0);

    const { futureValue } = sipFutureValue(sip!, annualReturn, years, 0);
    expect(futureValue).toBeCloseTo(target, -1); // within ~10 rupees
  });
});

describe("inflationAdjusted", () => {
  it("grows the amount by the inflation rate compounded", () => {
    // 100 at 10% inflation for 2 years -> 121
    expect(inflationAdjusted(100, 10, 2)).toBeCloseTo(121, 5);
  });
});

describe("scenarioBand", () => {
  it("bear is 7 below base, bull is 6 above, unless floored at -10", () => {
    const band = scenarioBand(12);
    expect(band.base).toBe(12);
    expect(band.bear).toBe(5);
    expect(band.bull).toBe(18);
  });

  it("floors the bear case at -10 instead of going lower", () => {
    const band = scenarioBand(-5);
    expect(band.bear).toBe(-10);
  });
});

describe("financialYear", () => {
  it("dates from April onward belong to the FY starting that same year", () => {
    expect(financialYear(new Date(2025, 3, 1))).toBe("2025-26"); // April 1, 2025
    expect(financialYear(new Date(2025, 11, 31))).toBe("2025-26"); // Dec 31, 2025
  });

  it("dates before April belong to the FY that started the previous year", () => {
    expect(financialYear(new Date(2025, 0, 15))).toBe("2024-25"); // Jan 15, 2025
    expect(financialYear(new Date(2025, 2, 31))).toBe("2024-25"); // March 31, 2025
  });
});

describe("financialYearRange", () => {
  it("resolves an FY label back to its April 1 - March 31 date range", () => {
    const { start, end } = financialYearRange("2024-25");
    expect(start.getFullYear()).toBe(2024);
    expect(start.getMonth()).toBe(3); // April
    expect(start.getDate()).toBe(1);
    expect(end.getFullYear()).toBe(2025);
    expect(end.getMonth()).toBe(2); // March
    expect(end.getDate()).toBe(31);
  });
});

describe("round", () => {
  it("rounds to 2 decimal places by default", () => {
    expect(round(1.005001)).toBe(1.01);
    expect(round(1.234)).toBe(1.23);
  });

  it("respects a custom decimal-place count", () => {
    expect(round(1.23456, 3)).toBe(1.235);
    expect(round(123.456, 0)).toBe(123);
  });
});
