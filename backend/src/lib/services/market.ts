// Shared market-data helpers used by several routes: sector performance,
// today's move for a symbol against its sector/market, and small utility
// wrappers around the provider layer.

import { marketDataProvider } from "../providers";
import { SECTOR_INDICES } from "../symbols";
import { pctChange } from "../indicators";
import { cache, TTL } from "../cache";

export async function getSectorPerformance() {
  const { value } = await cache.wrap("sector-performance", TTL.sector, async () => {
    const quotes = await marketDataProvider.getQuotes(SECTOR_INDICES.map((s) => s.ticker));
    return SECTOR_INDICES.map((s) => {
      const q = quotes[s.ticker];
      return {
        key: s.key,
        label: s.label,
        pctChange: q ? pctChange(q.price, q.prevClose) : null,
        price: q?.price ?? null,
      };
    });
  });
  return value;
}

export async function getSectorChangeForKey(sectorKey: string | null): Promise<number | null> {
  if (!sectorKey) return null;
  const perf = await getSectorPerformance();
  return perf.find((s) => s.key === sectorKey)?.pctChange ?? null;
}
