// Reference universe for mutual fund recommendations: a curated set of real,
// well-known scheme codes on the public AMFI feed (via fundProvider), grouped
// by category. This is reference data only (which schemes to look up) — the
// actual NAV and returns are always fetched live from the real feed, never
// hardcoded here. Every code below was looked up and verified against the
// live feed before being added; if AMFI retires or renames a scheme, it will
// simply drop out of getFundRecommendations() (fundProvider.getScheme
// returns null), not silently show stale numbers.
//
// This mirrors the same "curated reference list, not the whole market"
// approach as universe.ts for stocks — recommending from the ~4,000+ live
// mutual fund schemes on the AMFI feed would mean fetching and ranking
// thousands of NAV histories on every request.

export type FundCategory = "INDEX" | "LARGE_CAP" | "FLEXI_CAP" | "MID_CAP" | "SMALL_CAP" | "ELSS" | "DEBT";

export const FUND_CATEGORY_LABELS: Record<FundCategory, string> = {
  INDEX: "Index Funds",
  LARGE_CAP: "Large Cap",
  FLEXI_CAP: "Flexi Cap",
  MID_CAP: "Mid Cap",
  SMALL_CAP: "Small Cap",
  ELSS: "ELSS (Tax Saver)",
  DEBT: "Debt / Corporate Bond",
};

export type MfUniverseEntry = {
  schemeCode: string;
  fundHouse: string;
  category: FundCategory;
};

export const MF_UNIVERSE: MfUniverseEntry[] = [
  // ── Index ──
  { schemeCode: "120716", fundHouse: "UTI", category: "INDEX" }, // UTI Nifty 50 Index Fund - Direct - Growth
  { schemeCode: "149373", fundHouse: "Axis", category: "INDEX" }, // Axis Nifty 50 Index Fund - Direct - Growth

  // ── Large Cap ──
  { schemeCode: "118825", fundHouse: "Mirae Asset", category: "LARGE_CAP" }, // Mirae Asset Large Cap Fund - Direct - Growth

  // ── Flexi Cap ──
  { schemeCode: "122639", fundHouse: "Parag Parikh", category: "FLEXI_CAP" }, // Parag Parikh Flexi Cap Fund - Direct - Growth
  { schemeCode: "118955", fundHouse: "HDFC", category: "FLEXI_CAP" }, // HDFC Flexi Cap Fund - Direct - Growth
  { schemeCode: "120166", fundHouse: "Kotak", category: "FLEXI_CAP" }, // Kotak Flexi Cap Fund - Direct - Growth

  // ── Mid Cap ──
  { schemeCode: "147445", fundHouse: "Mirae Asset", category: "MID_CAP" }, // Mirae Asset Midcap Fund - Direct - Growth
  // A L&T Mid Cap Fund candidate (119807) was checked and dropped — its NAV
  // was last published Nov 2022 and hasn't moved since (L&T Mutual Fund was
  // acquired by HSBC that year; this scheme code is dead, not top-performing).
  // The recommendation service also filters any fund by NAV freshness at
  // runtime, but a known-dead code has no reason to stay in this list.

  // ── Small Cap ──
  { schemeCode: "118778", fundHouse: "Nippon India", category: "SMALL_CAP" }, // Nippon India Small Cap Fund - Direct - Growth
  { schemeCode: "125497", fundHouse: "SBI", category: "SMALL_CAP" }, // SBI Small Cap Fund - Direct - Growth
  { schemeCode: "120164", fundHouse: "Kotak", category: "SMALL_CAP" }, // Kotak Small Cap Fund - Direct - Growth
  { schemeCode: "120828", fundHouse: "Quant", category: "SMALL_CAP" }, // Quant Small Cap Fund - Direct - Growth

  // ── ELSS (tax saver) ──
  { schemeCode: "119723", fundHouse: "SBI", category: "ELSS" }, // SBI ELSS Tax Saver Fund - Direct - Growth

  // ── Debt ──
  { schemeCode: "146215", fundHouse: "SBI", category: "DEBT" }, // SBI Corporate Bond Fund - Direct - Growth
  // Note: a Tata Corporate Bond Fund candidate was checked and dropped — its
  // live feed showed a -38% one-year return, physically implausible for a
  // corporate bond fund and almost certainly a NAV-history data artifact.
  // Rather than "fix" or hide it, it's simply excluded from this list until
  // the underlying feed data looks sane again.
];
