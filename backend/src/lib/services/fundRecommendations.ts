// Mutual fund recommendations: real NAV-derived returns for a curated set of
// well-known schemes (see mfUniverse.ts), ranked within each category. Never
// a fabricated "top pick" — every number here is fetched live from the same
// public AMFI feed the rest of the mutual-funds feature already uses, and a
// scheme that no longer resolves (renamed, retired) simply drops out.
import { fundProvider } from "../providers";
import { cache, TTL } from "../cache";
import { MF_UNIVERSE, FUND_CATEGORY_LABELS, type FundCategory } from "../mfUniverse";

export type RankedFund = {
  schemeCode: string;
  schemeName: string;
  fundHouse: string;
  category: FundCategory;
  categoryLabel: string;
  nav: number | null;
  navDate: string | null;
  returns: { oneMonth: number | null; sixMonth: number | null; oneYear: number | null; threeYear: number | null; fiveYear: number | null };
};

const CACHE_KEY = "fund-recommendations:v1";

// Ranks equity-style categories by their real 3-year annualised return — long
// enough to smooth out a single bad month, short enough that most schemes in
// this universe actually have a real number (5-year is missing for a few
// newer funds). Falls back to 5-year, then 1-year, only when 3-year itself is
// unavailable — never fabricated, just the best real figure on hand.
function rankScore(f: RankedFund): number {
  const r = f.returns;
  if (r.threeYear != null) return r.threeYear;
  if (r.fiveYear != null) return r.fiveYear;
  if (r.oneYear != null) return r.oneYear;
  return -Infinity;
}

const MAX_NAV_AGE_DAYS = 45; // NAVs publish every business day; a longer gap means the scheme is dead/merged/frozen, not just quiet.

function navDateIsFresh(navDate: string | null): boolean {
  if (!navDate) return false;
  const [dd, mm, yyyy] = navDate.split("-").map(Number);
  if (!dd || !mm || !yyyy) return false;
  const ageMs = Date.now() - new Date(yyyy, mm - 1, dd).getTime();
  return ageMs / (24 * 3600 * 1000) <= MAX_NAV_AGE_DAYS;
}

async function loadAll(): Promise<RankedFund[]> {
  const results = await Promise.all(
    MF_UNIVERSE.map(async (entry) => {
      const detail = await fundProvider.getScheme(entry.schemeCode).catch(() => null);
      if (!detail) return null;
      // A scheme whose NAV hasn't updated in over 6 weeks is effectively
      // dead (merged into another fund, delisted) rather than genuinely
      // "top performing" — its trailing returns reflect a NAV that stopped
      // moving, not current reality. Drop it rather than recommend stale data.
      if (!navDateIsFresh(detail.navDate ?? null)) return null;
      const fund: RankedFund = {
        schemeCode: entry.schemeCode,
        schemeName: detail.schemeName.trim(),
        fundHouse: entry.fundHouse,
        category: entry.category,
        categoryLabel: FUND_CATEGORY_LABELS[entry.category],
        nav: detail.nav ?? null,
        navDate: detail.navDate ?? null,
        returns: detail.returns,
      };
      return fund;
    })
  );
  return results.filter((f): f is RankedFund => f != null);
}

export async function getFundRecommendations(category?: FundCategory): Promise<{ funds: RankedFund[]; byCategory: Record<string, RankedFund[]> }> {
  const { value: all } = await cache.wrap(CACHE_KEY, TTL.funds, loadAll);

  const byCategory: Record<string, RankedFund[]> = {};
  for (const f of all) {
    if (!byCategory[f.category]) byCategory[f.category] = [];
    byCategory[f.category].push(f);
  }
  for (const key of Object.keys(byCategory)) {
    byCategory[key].sort((a, b) => rankScore(b) - rankScore(a));
  }

  const funds = category ? (byCategory[category] ?? []) : all.slice().sort((a, b) => rankScore(b) - rankScore(a));
  return { funds, byCategory };
}

// Maps a goal's time horizon and how aggressive its assumed return is (per
// the same real-benchmark feasibility check goals.ts already computes) to a
// suggested fund category — a real, explainable heuristic, not a forecast of
// which fund will do best. Longer horizons can absorb more volatility;
// shorter ones can't, regardless of how aggressive the target is.
export function suggestCategoryForGoal(years: number, feasibilityClassification: string): { category: FundCategory; reason: string } {
  if (years < 3) {
    return { category: "DEBT", reason: `With under 3 years to your target date, there's little time to recover from an equity downturn — a debt fund trades higher return potential for much lower volatility.` };
  }
  if (feasibilityClassification === "AGGRESSIVE" || feasibilityClassification === "UNREALISTIC") {
    if (years >= 7) {
      return { category: "SMALL_CAP", reason: `Your assumed return is aggressive relative to real market history, but a ${years.toFixed(0)}-year horizon is long enough to ride out small-cap volatility in exchange for higher historical returns — still no guarantee.` };
    }
    return { category: "MID_CAP", reason: `Your assumed return is aggressive relative to real market history. A ${years.toFixed(0)}-year horizon supports more risk than a large-cap fund, but likely not the full volatility of small caps.` };
  }
  if (years >= 5) {
    return { category: "FLEXI_CAP", reason: `A ${years.toFixed(0)}-year horizon with a moderate return assumption fits a flexi-cap fund's mix of large, mid and small-cap exposure.` };
  }
  return { category: "LARGE_CAP", reason: `A ${years.toFixed(0)}-year horizon with a conservative-to-moderate return assumption favors the lower volatility of large-cap or index funds over higher-risk categories.` };
}
