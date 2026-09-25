import { describe, it, expect } from "vitest";
import { buildPortfolioTrackRecord, type SnapshotRow } from "./portfolioSnapshot";

const row = (date: string, investedInr: number, valueInr: number, niftyClose: number | null = null): SnapshotRow => ({
  date: new Date(`${date}T00:00:00Z`),
  investedInr,
  valueInr,
  holdingsCount: 3,
  niftyClose,
});

describe("buildPortfolioTrackRecord", () => {
  it("returns an empty record with no snapshots", () => {
    const r = buildPortfolioTrackRecord([]);
    expect(r.days).toEqual([]);
    expect(r.summary.daysTracked).toBe(0);
    expect(r.summary.portfolioReturnPct).toBeNull();
  });

  it("a single day has P&L but no return yet (nothing to compare against)", () => {
    const r = buildPortfolioTrackRecord([row("2026-09-25", 100000, 105000, 25000)]);
    expect(r.days[0].pnlInr).toBe(5000);
    expect(r.days[0].pnlPct).toBe(5);
    expect(r.days[0].dayReturnPct).toBeNull();
    expect(r.summary.portfolioReturnPct).toBeNull();
  });

  it("measures a day's return as the change in P&L over the previous day's value", () => {
    const r = buildPortfolioTrackRecord([row("2026-09-25", 100000, 100000), row("2026-09-26", 100000, 102000)]);
    expect(r.days[1].dayChangeInr).toBe(2000);
    expect(r.days[1].dayReturnPct).toBe(2);
    expect(r.summary.portfolioReturnPct).toBe(2);
  });

  it("buying more is not counted as a gain — invested and value rise together", () => {
    // Day 2: bought ₹50,000 more at market price, prices otherwise flat
    const r = buildPortfolioTrackRecord([row("2026-09-25", 100000, 100000), row("2026-09-26", 150000, 150000)]);
    expect(r.days[1].dayChangeInr).toBe(0);
    expect(r.days[1].dayReturnPct).toBe(0);
  });

  it("chains daily returns (compounding) rather than adding them", () => {
    const r = buildPortfolioTrackRecord([
      row("2026-09-25", 100000, 100000),
      row("2026-09-26", 100000, 110000), // +10%
      row("2026-09-29", 100000, 99000), // -10% of 110000
    ]);
    expect(r.days[2].cumulativeReturnPct).toBe(-1);
  });

  it("compares against NIFTY from the first snapshot's close", () => {
    const r = buildPortfolioTrackRecord([
      row("2026-09-25", 100000, 100000, 25000),
      row("2026-09-26", 100000, 101000, 25500),
    ]);
    expect(r.days[1].niftyDayReturnPct).toBe(2);
    expect(r.summary.niftyReturnPct).toBe(2);
    expect(r.summary.portfolioReturnPct).toBe(1);
  });

  it("sorts input by date and tolerates a missing NIFTY close", () => {
    const r = buildPortfolioTrackRecord([
      row("2026-09-26", 100000, 101000, null),
      row("2026-09-25", 100000, 100000, 25000),
    ]);
    expect(r.days.map((d) => d.date)).toEqual(["2026-09-25", "2026-09-26"]);
    expect(r.days[1].niftyDayReturnPct).toBeNull();
    expect(r.summary.since).toBe("2026-09-25");
  });
});
