import { describe, it, expect, vi } from "vitest";

vi.mock("../prisma", () => ({
  prisma: {
    mfHolding: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../providers", () => ({
  fundProvider: {
    getScheme: vi.fn(),
  },
}));

import { getEnrichedMfHoldings } from "./mfPortfolio";
import { prisma } from "../prisma";
import { fundProvider } from "../providers";

describe("getEnrichedMfHoldings", () => {
  it("returns zero summary when user has no holdings", async () => {
    vi.mocked(prisma.mfHolding.findMany).mockResolvedValueOnce([] as any);

    const result = await getEnrichedMfHoldings("user-1");
    expect(result.holdings).toHaveLength(0);
    expect(result.summary.totalInvested).toBe(0);
    expect(result.summary.totalValue).toBe(0);
    expect(result.summary.totalPl).toBe(0);
    expect(result.summary.fundCount).toBe(0);
  });

  it("calculates values, P&L and percentages accurately based on live AMFI NAV", async () => {
    vi.mocked(prisma.mfHolding.findMany).mockResolvedValueOnce([
      {
        id: "mf-1",
        userId: "user-1",
        schemeCode: "122639",
        schemeName: "Parag Parikh Flexi Cap Fund",
        folioNumber: "12345/67",
        units: 100,
        avgNav: 50.0,
        invested: 5000,
        source: "MANUAL",
        broker: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: "mf-2",
        userId: "user-1",
        schemeCode: "120503",
        schemeName: "Nippon India Small Cap Fund",
        folioNumber: null,
        units: 50,
        avgNav: 100.0,
        invested: 5000,
        source: "BROKER",
        broker: "ZERODHA",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ] as any);

    vi.mocked(fundProvider.getScheme).mockImplementation(async (code) => {
      if (code === "122639") {
        return {
          schemeCode: "122639",
          schemeName: "Parag Parikh Flexi Cap Fund - Direct Growth",
          fundHouse: "PPFAS Mutual Fund",
          category: "Flexi Cap",
          nav: 60.0,
          navDate: "15-09-2026",
          history: [],
          returns: { oneMonth: 2, sixMonth: 8, oneYear: 15, threeYear: 22, fiveYear: 25 },
        };
      }
      if (code === "120503") {
        return {
          schemeCode: "120503",
          schemeName: "Nippon India Small Cap Fund - Direct Growth",
          fundHouse: "Nippon Life India AMC",
          category: "Small Cap",
          nav: 120.0,
          navDate: "15-09-2026",
          history: [],
          returns: { oneMonth: 3, sixMonth: 12, oneYear: 20, threeYear: 28, fiveYear: 30 },
        };
      }
      return null;
    });

    const result = await getEnrichedMfHoldings("user-1");

    expect(result.holdings).toHaveLength(2);
    expect(result.summary.fundCount).toBe(2);
    expect(result.summary.totalUnits).toBe(150);

    // mf-1: 100 units * 50 = 5000 invested; 100 units * 60 = 6000 value; P&L = +1000 (+20%)
    const mf1 = result.holdings.find((h) => h.schemeCode === "122639");
    expect(mf1).toBeDefined();
    expect(mf1?.invested).toBe(5000);
    expect(mf1?.currentValue).toBe(6000);
    expect(mf1?.pl).toBe(1000);
    expect(mf1?.plPct).toBe(20);

    // mf-2: 50 units * 100 = 5000 invested; 50 units * 120 = 6000 value; P&L = +1000 (+20%)
    const mf2 = result.holdings.find((h) => h.schemeCode === "120503");
    expect(mf2).toBeDefined();
    expect(mf2?.invested).toBe(5000);
    expect(mf2?.currentValue).toBe(6000);
    expect(mf2?.pl).toBe(1000);
    expect(mf2?.plPct).toBe(20);

    // Total: invested = 10,000; value = 12,000; pl = +2,000 (+20%)
    expect(result.summary.totalInvested).toBe(10000);
    expect(result.summary.totalValue).toBe(12000);
    expect(result.summary.totalPl).toBe(2000);
    expect(result.summary.totalPlPct).toBe(20);
  });
});
