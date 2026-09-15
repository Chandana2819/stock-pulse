import { describe, it, expect } from "vitest";
import { analyzeHeadline, aggregateSentiment, type NewsAnalysis } from "./sentiment";

describe("analyzeHeadline — sentiment classification", () => {
  it("classifies a clearly negative headline as NEGATIVE", () => {
    const result = analyzeHeadline("Company shares crash after profit warning and downgrade");
    expect(result.sentiment).toBe("NEGATIVE");
    expect(result.sentimentScore).toBeLessThan(0);
  });

  it("classifies a clearly positive headline as POSITIVE", () => {
    const result = analyzeHeadline("Stock surges to record high after strong earnings beat and upgrade");
    expect(result.sentiment).toBe("POSITIVE");
    expect(result.sentimentScore).toBeGreaterThan(0);
  });

  it("classifies a headline with no sentiment words as NEUTRAL with a zero score", () => {
    const result = analyzeHeadline("Company announces quarterly board meeting schedule");
    expect(result.sentiment).toBe("NEUTRAL");
    expect(result.sentimentScore).toBe(0);
  });

  it("dampens a single weak match rather than treating it as full-strength sentiment", () => {
    // One positive word only — confidenceFactor = min(1, 1/3) = 0.333, so
    // rawScore (1.0) gets damped well below the ±0.15 NEGATIVE/POSITIVE cutoff...
    // actually one clean match still crosses it; verify it's damped, not raw 1.0.
    const result = analyzeHeadline("Company reports steady growth this quarter");
    expect(Math.abs(result.sentimentScore)).toBeLessThan(1);
  });

  it("is case-insensitive", () => {
    const lower = analyzeHeadline("stock surges after strong earnings beat");
    const upper = analyzeHeadline("STOCK SURGES AFTER STRONG EARNINGS BEAT");
    expect(lower.sentiment).toBe(upper.sentiment);
    expect(lower.sentimentScore).toBe(upper.sentimentScore);
  });
});

describe("analyzeHeadline — importance classification", () => {
  it("flags RBI/policy headlines as HIGH importance", () => {
    const result = analyzeHeadline("RBI holds repo rate steady in latest monetary policy review");
    expect(result.importance).toBe("HIGH");
  });

  it("flags dividend/buyback headlines as MEDIUM importance", () => {
    const result = analyzeHeadline("Company announces special dividend for shareholders");
    expect(result.importance).toBe("MEDIUM");
  });

  it("defaults to LOW importance for routine headlines", () => {
    const result = analyzeHeadline("Company updates its website design");
    expect(result.importance).toBe("LOW");
  });
});

describe("analyzeHeadline — symbol and sector tagging", () => {
  it("always includes the hint symbol, uppercased, in the result", () => {
    const result = analyzeHeadline("Some unrelated headline text", "tcs.ns");
    expect(result.symbols).toContain("TCS.NS");
  });

  it("tags a sector when sector keywords are present", () => {
    const result = analyzeHeadline("Banking sector lender reports higher NPAs amid rising rates");
    expect(result.sectors).toContain("BANK");
  });
});

describe("aggregateSentiment", () => {
  function fake(sentiment: NewsAnalysis["sentiment"], score: number, importance: NewsAnalysis["importance"]): NewsAnalysis {
    return { sentiment, sentimentScore: score, importance, symbols: [], sectors: [], matchedTerms: [] };
  }

  it("returns NEUTRAL with a zero score for an empty list", () => {
    const result = aggregateSentiment([]);
    expect(result.score).toBe(0);
    expect(result.label).toBe("NEUTRAL");
  });

  it("weighs HIGH-importance articles more heavily than LOW-importance ones", () => {
    // One strongly negative HIGH-importance article should outweigh two mildly
    // positive LOW-importance ones.
    const items = [
      fake("NEGATIVE", -0.8, "HIGH"),
      fake("POSITIVE", 0.2, "LOW"),
      fake("POSITIVE", 0.2, "LOW"),
    ];
    const result = aggregateSentiment(items);
    expect(result.label).toBe("NEGATIVE");
  });

  it("counts articles per sentiment bucket correctly", () => {
    const items = [fake("POSITIVE", 0.5, "LOW"), fake("POSITIVE", 0.5, "LOW"), fake("NEGATIVE", -0.5, "LOW")];
    const result = aggregateSentiment(items);
    expect(result.counts.POSITIVE).toBe(2);
    expect(result.counts.NEGATIVE).toBe(1);
  });
});
