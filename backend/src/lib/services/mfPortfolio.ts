import { prisma } from "../prisma";
import { fundProvider } from "../providers";

export type EnrichedMfHolding = {
  id: string;
  schemeCode: string;
  schemeName: string;
  folioNumber: string | null;
  units: number;
  avgNav: number;
  currentNav: number;
  navDate?: string | null;
  category?: string;
  fundHouse?: string;
  invested: number;
  currentValue: number;
  pl: number;
  plPct: number;
  source: string;
  broker: string | null;
  createdAt: string;
};

export type MfPortfolioSummary = {
  totalInvested: number;
  totalValue: number;
  totalPl: number;
  totalPlPct: number;
  fundCount: number;
  totalUnits: number;
};

export async function getEnrichedMfHoldings(userId: string): Promise<{
  holdings: EnrichedMfHolding[];
  summary: MfPortfolioSummary;
}> {
  const rawHoldings = await prisma.mfHolding.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  if (rawHoldings.length === 0) {
    return {
      holdings: [],
      summary: {
        totalInvested: 0,
        totalValue: 0,
        totalPl: 0,
        totalPlPct: 0,
        fundCount: 0,
        totalUnits: 0,
      },
    };
  }

  // Fetch live NAVs concurrently with bounded fallback
  const enriched: EnrichedMfHolding[] = await Promise.all(
    rawHoldings.map(async (h) => {
      let scheme = null;
      try {
        scheme = await fundProvider.getScheme(h.schemeCode);
      } catch (err) {
        console.warn(`[mfPortfolio] Could not fetch scheme ${h.schemeCode}:`, err);
      }

      const currentNav = scheme?.nav ?? h.avgNav;
      const invested = Number((h.invested ?? (h.units * h.avgNav)).toFixed(2));
      const currentValue = Number((h.units * currentNav).toFixed(2));
      const pl = Number((currentValue - invested).toFixed(2));
      const plPct = invested > 0 ? Number(((pl / invested) * 100).toFixed(2)) : 0;

      return {
        id: h.id,
        schemeCode: h.schemeCode,
        schemeName: scheme?.schemeName || h.schemeName,
        folioNumber: h.folioNumber,
        units: Number(h.units.toFixed(3)),
        avgNav: Number(h.avgNav.toFixed(4)),
        currentNav: Number(currentNav.toFixed(4)),
        navDate: scheme?.navDate,
        category: scheme?.category,
        fundHouse: scheme?.fundHouse,
        invested,
        currentValue,
        pl,
        plPct,
        source: h.source,
        broker: h.broker,
        createdAt: h.createdAt.toISOString(),
      };
    })
  );

  let totalInvested = 0;
  let totalValue = 0;
  let totalUnits = 0;

  for (const item of enriched) {
    totalInvested += item.invested;
    totalValue += item.currentValue;
    totalUnits += item.units;
  }

  const totalPl = Number((totalValue - totalInvested).toFixed(2));
  const totalPlPct = totalInvested > 0 ? Number(((totalPl / totalInvested) * 100).toFixed(2)) : 0;

  return {
    holdings: enriched,
    summary: {
      totalInvested: Number(totalInvested.toFixed(2)),
      totalValue: Number(totalValue.toFixed(2)),
      totalPl,
      totalPlPct,
      fundCount: enriched.length,
      totalUnits: Number(totalUnits.toFixed(3)),
    },
  };
}
