// Stock screener: filters the reference universe by live quote + fundamentals.
//
// Filtering happens after fetching data for the whole universe, bounded by the
// batching in YahooProvider.getQuotes. This is fine for the ~150-symbol
// reference universe here; swap the universe source for an exchange symbol
// master and this code does not need to change.

import { UNIVERSE, type UniverseEntry } from "../universe";
import { marketDataProvider } from "../providers";
import { pctChange } from "../indicators";

export type ScreenerFilters = {
  marketCapMin?: number;
  marketCapMax?: number;
  peMax?: number;
  peMin?: number;
  pbMax?: number;
  roeMin?: number;
  roceMin?: number;
  debtToEquityMax?: number;
  revenueGrowthMin?: number;
  profitGrowthMin?: number;
  epsGrowthMin?: number;
  dividendYieldMin?: number;
  sector?: string;
  exchange?: "NSE" | "GLOBAL";
  changePctMin?: number;
  changePctMax?: number;
};

export type ScreenerRow = {
  symbol: string;
  display: string;
  name: string;
  sector: string;
  exchange: string;
  price: number | null;
  changePct: number | null;
  marketCap: number | null;
  peRatio: number | null;
  pbRatio: number | null;
  roe: number | null;
  roce: number | null;
  debtToEquity: number | null;
  revenueGrowth: number | null;
  profitGrowth: number | null;
  dividendYield: number | null;
};

function passesFilters(row: ScreenerRow, f: ScreenerFilters): boolean {
  if (f.sector && row.sector !== f.sector) return false;
  if (f.exchange && row.exchange !== f.exchange) return false;
  if (f.marketCapMin != null && (row.marketCap == null || row.marketCap < f.marketCapMin)) return false;
  if (f.marketCapMax != null && (row.marketCap == null || row.marketCap > f.marketCapMax)) return false;
  if (f.peMax != null && (row.peRatio == null || row.peRatio > f.peMax)) return false;
  if (f.peMin != null && (row.peRatio == null || row.peRatio < f.peMin)) return false;
  if (f.pbMax != null && (row.pbRatio == null || row.pbRatio > f.pbMax)) return false;
  if (f.roeMin != null && (row.roe == null || row.roe < f.roeMin)) return false;
  if (f.roceMin != null && (row.roce == null || row.roce < f.roceMin)) return false;
  if (f.debtToEquityMax != null && (row.debtToEquity == null || row.debtToEquity > f.debtToEquityMax)) return false;
  if (f.revenueGrowthMin != null && (row.revenueGrowth == null || row.revenueGrowth < f.revenueGrowthMin)) return false;
  if (f.profitGrowthMin != null && (row.profitGrowth == null || row.profitGrowth < f.profitGrowthMin)) return false;
  if (f.dividendYieldMin != null && (row.dividendYield == null || row.dividendYield < f.dividendYieldMin)) return false;
  if (f.changePctMin != null && (row.changePct == null || row.changePct < f.changePctMin)) return false;
  if (f.changePctMax != null && (row.changePct == null || row.changePct > f.changePctMax)) return false;
  return true;
}

export async function runScreener(filters: ScreenerFilters, limit = 500): Promise<ScreenerRow[]> {
  const candidates: UniverseEntry[] = filters.sector
    ? UNIVERSE.filter((u) => u.sector === filters.sector)
    : UNIVERSE;
  const symbols = candidates.map((u) => u.symbol);

  const [quotes, fundamentalsList] = await Promise.all([
    marketDataProvider.getQuotes(symbols),
    Promise.all(symbols.map((s) => marketDataProvider.getFundamentals(s).catch(() => null))),
  ]);

  const rows: ScreenerRow[] = candidates.map((u, i) => {
    const q = quotes[u.symbol];
    const f = fundamentalsList[i];
    return {
      symbol: u.symbol,
      display: u.display,
      name: u.name,
      sector: u.sector,
      exchange: u.exchange,
      price: q?.price ?? null,
      changePct: q ? pctChange(q.price, q.prevClose) : null,
      marketCap: f?.marketCap ?? null,
      peRatio: f?.peRatio ?? null,
      pbRatio: f?.pbRatio ?? null,
      roe: f?.roe ?? null,
      roce: f?.roce ?? null,
      debtToEquity: f?.debtToEquity ?? null,
      revenueGrowth: f?.revenueGrowth ?? null,
      profitGrowth: f?.profitGrowth ?? null,
      dividendYield: f?.dividendYield ?? null,
    };
  });

  return rows.filter((r) => passesFilters(r, filters)).slice(0, limit);
}
