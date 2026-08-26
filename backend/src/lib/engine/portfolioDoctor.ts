// Portfolio Doctor — a portfolio-wide health check.
//
// Looks at concentration, sector exposure, currency mix and cash position and
// turns them into a 0-100 score plus plain-English strengths/problems, the
// same way a human advisor would flag "too much in one stock" or "too much in
// one sector". It also runs simple stress scenarios ("if IT falls 10%, you
// lose about X%") using only the user's own live position sizes — no
// fabricated correlations.

import { lookupUniverse } from "../universe";

export type HoldingLite = {
  stock: string;
  displaySym: string;
  currency: "INR" | "USD";
  value: number; // current market value in its own currency
  sectorKey: string | null;
  sector: string | null;
};

export type PortfolioHealth = {
  score: number; // 0-100, higher is healthier
  strengths: string[];
  problems: string[];
  concentration: { symbol: string; pctOfPortfolio: number }[];
  sectorExposure: { sectorKey: string; sector: string; pctOfPortfolio: number }[];
  stressTests: { label: string; shockPct: number; sectorKey: string | null; estimatedImpactPct: number }[];
  cashPct: number;
};

export function diagnosePortfolio(input: {
  holdings: HoldingLite[];
  cashInr: number;
  cashUsd: number;
  usdToInr: number; // for a blended total; pass 83 as a reasonable static fallback if FX is unavailable
  riskTolerance: "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE";
}): PortfolioHealth {
  const enriched = input.holdings.map((h) => {
    const entry = lookupUniverse(h.stock);
    return { ...h, sectorKey: h.sectorKey ?? entry?.sectorKey ?? null, sector: h.sector ?? entry?.sector ?? null };
  });

  const investedInr = enriched.reduce((sum, h) => sum + (h.currency === "USD" ? h.value * input.usdToInr : h.value), 0);
  const cashTotalInr = input.cashInr + input.cashUsd * input.usdToInr;
  const totalInr = investedInr + cashTotalInr;
  const cashPct = totalInr > 0 ? (cashTotalInr / totalInr) * 100 : 100;

  const concentration = enriched
    .map((h) => ({
      symbol: h.displaySym,
      pctOfPortfolio: totalInr > 0 ? ((h.currency === "USD" ? h.value * input.usdToInr : h.value) / totalInr) * 100 : 0,
    }))
    .sort((a, b) => b.pctOfPortfolio - a.pctOfPortfolio);

  const sectorMap = new Map<string, { sector: string; value: number }>();
  for (const h of enriched) {
    const key = h.sectorKey ?? "OTHER";
    const valueInr = h.currency === "USD" ? h.value * input.usdToInr : h.value;
    const prev = sectorMap.get(key) ?? { sector: h.sector ?? "Other / Unclassified", value: 0 };
    prev.value += valueInr;
    sectorMap.set(key, prev);
  }
  const sectorExposure = [...sectorMap.entries()]
    .map(([sectorKey, v]) => ({ sectorKey, sector: v.sector, pctOfPortfolio: totalInr > 0 ? (v.value / totalInr) * 100 : 0 }))
    .sort((a, b) => b.pctOfPortfolio - a.pctOfPortfolio);

  const strengths: string[] = [];
  const problems: string[] = [];
  let score = 100;

  const concentrationCap = input.riskTolerance === "CONSERVATIVE" ? 15 : input.riskTolerance === "MODERATE" ? 20 : 28;
  const top = concentration[0];
  if (top && top.pctOfPortfolio > concentrationCap) {
    const penalty = Math.min(25, Math.round((top.pctOfPortfolio - concentrationCap) * 1.2));
    score -= penalty;
    problems.push(`High concentration in ${top.symbol} (${top.pctOfPortfolio.toFixed(1)}% of the portfolio)`);
  } else if (concentration.length >= 5) {
    strengths.push("No single stock dominates the portfolio");
  }

  const top2Sum = concentration.slice(0, 2).reduce((a, c) => a + c.pctOfPortfolio, 0);
  if (concentration.length >= 2 && top2Sum > concentrationCap * 1.6) {
    score -= 10;
    problems.push(`High concentration in just 2 stocks (${top2Sum.toFixed(1)}% combined)`);
  }

  const sectorCap = input.riskTolerance === "CONSERVATIVE" ? 25 : input.riskTolerance === "MODERATE" ? 35 : 45;
  const topSector = sectorExposure[0];
  if (topSector && topSector.pctOfPortfolio > sectorCap) {
    const penalty = Math.min(25, Math.round((topSector.pctOfPortfolio - sectorCap) * 1.0));
    score -= penalty;
    problems.push(`${topSector.pctOfPortfolio.toFixed(0)}% ${topSector.sector} exposure — above a healthy range for your risk profile`);
  } else if (sectorExposure.length >= 3) {
    strengths.push("Reasonably diversified across sectors");
  }

  if (cashPct < 3 && input.riskTolerance !== "AGGRESSIVE") {
    score -= 8;
    problems.push("Very little cash buffer — no dry powder for opportunities or emergencies");
  } else if (cashPct >= 5 && cashPct <= 30) {
    strengths.push("Healthy cash position");
  } else if (cashPct > 60) {
    score -= 5;
    problems.push("Large uninvested cash balance relative to holdings");
  }

  const largeCapLike = enriched.filter((h) => ["BANK", "IT", "FMCG", "ENERGY"].includes(h.sectorKey ?? "")).length;
  if (largeCapLike >= 2) strengths.push("Meaningful large-cap exposure");

  if (enriched.length === 0) {
    problems.push("No holdings yet — the portfolio is 100% cash");
    score = 60;
  }

  score = Math.max(0, Math.min(100, score));

  const stressTests: PortfolioHealth["stressTests"] = sectorExposure.slice(0, 3).map((s) => ({
    label: `If ${s.sector} falls 10%`,
    shockPct: -10,
    sectorKey: s.sectorKey,
    estimatedImpactPct: Number((-10 * (s.pctOfPortfolio / 100)).toFixed(2)),
  }));
  stressTests.push({
    label: "If the broad market falls 10%",
    shockPct: -10,
    sectorKey: null,
    estimatedImpactPct: Number((-10 * ((100 - cashPct) / 100)).toFixed(2)),
  });

  if (strengths.length === 0 && enriched.length > 0) strengths.push("No major structural issues detected beyond what is listed under Problems");

  return { score, strengths, problems, concentration, sectorExposure, stressTests, cashPct: Number(cashPct.toFixed(1)) };
}
