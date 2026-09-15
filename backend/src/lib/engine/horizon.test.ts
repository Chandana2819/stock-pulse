import { describe, it, expect } from "vitest";
import { computeSignalHorizon } from "./horizon";
import type { PillarScore } from "./decision";

function pillar(key: string, score: number, weight: number, available = true): PillarScore {
  return { key, label: key, score, weight, evidence: [], available };
}

describe("computeSignalHorizon", () => {
  it("classifies as SHORT-term when momentum/volume/sentiment dominate the deviation from neutral", () => {
    const pillars: PillarScore[] = [
      pillar("momentum", 90, 0.15), // far from 50, short-term bucket
      pillar("volume", 85, 0.10), // far from 50, short-term bucket
      pillar("fundamentals", 55, 0.20), // close to 50, long-term bucket but weak pull
      pillar("trend", 52, 0.20),
      pillar("risk", 50, 0.10),
      pillar("marketSector", 50, 0.15),
      pillar("sentiment", 50, 0.10),
    ];
    const result = computeSignalHorizon(pillars, "STRONG BUY");
    expect(result.term).toBe("SHORT");
    expect(result.reviewByDays).toBe(5);
  });

  it("classifies as LONG-term when fundamentals dominate the deviation from neutral", () => {
    const pillars: PillarScore[] = [
      pillar("fundamentals", 95, 0.20), // far from 50, long-term bucket
      pillar("momentum", 52, 0.15),
      pillar("volume", 50, 0.10),
      pillar("trend", 50, 0.20),
      pillar("risk", 50, 0.10),
      pillar("marketSector", 50, 0.15),
      pillar("sentiment", 50, 0.10),
    ];
    const result = computeSignalHorizon(pillars, "BUY");
    expect(result.term).toBe("LONG");
    expect(result.reviewByDays).toBe(45);
  });

  it("ignores unavailable pillars when computing dominant horizon", () => {
    const pillars: PillarScore[] = [
      pillar("momentum", 95, 0.15, false), // unavailable — should not count
      pillar("fundamentals", 90, 0.20), // far from 50, long-term
      pillar("trend", 50, 0.20),
      pillar("risk", 50, 0.10),
      pillar("marketSector", 50, 0.15),
      pillar("sentiment", 50, 0.10),
      pillar("volume", 50, 0.10),
    ];
    const result = computeSignalHorizon(pillars, "BUY");
    expect(result.term).toBe("LONG");
    expect(result.dominantPillars).not.toContain("momentum");
  });

  it("defaults to MEDIUM when every pillar sits exactly at neutral (no real signal)", () => {
    const pillars: PillarScore[] = [
      pillar("trend", 50, 0.20),
      pillar("momentum", 50, 0.15),
      pillar("volume", 50, 0.10),
      pillar("fundamentals", 50, 0.20),
      pillar("sentiment", 50, 0.10),
      pillar("risk", 50, 0.10),
      pillar("marketSector", 50, 0.15),
    ];
    const result = computeSignalHorizon(pillars, "HOLD");
    expect(result.term).toBe("MEDIUM");
    expect(result.dominantPillars).toHaveLength(0);
  });

  it("sets reviewBy to a real future ISO date consistent with reviewByDays", () => {
    // reviewBy is built from local date arithmetic (setDate) but serialized
    // via toISOString (UTC), so the calendar day can shift by one depending
    // on the runner's timezone offset and time of day — that's a cosmetic
    // imprecision in a "review in ~N days" estimate, not something worth
    // chasing here. Assert within a 1-day tolerance so the test is
    // deterministic regardless of when/where it runs, instead of asserting
    // exact equality across a local/UTC boundary it can't control.
    const pillars: PillarScore[] = [pillar("momentum", 90, 0.15)];
    const todayUTCDateOnly = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    const result = computeSignalHorizon(pillars, "BUY");
    const reviewByDate = new Date(result.reviewBy);
    const diffDays = Math.round((reviewByDate.getTime() - todayUTCDateOnly) / (24 * 3600 * 1000));
    expect(Math.abs(diffDays - result.reviewByDays)).toBeLessThanOrEqual(1);
  });

  it("always includes the non-prediction caveat", () => {
    const result = computeSignalHorizon([pillar("trend", 80, 0.20)], "BUY");
    expect(result.caveat).toMatch(/not a guarantee/i);
  });
});
