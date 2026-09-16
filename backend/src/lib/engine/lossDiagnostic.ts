// Loss Diagnostic & Market Crash Radar Engine
// ---------------------------------------------
// Computes:
// 1. Loss Attribution — which stocks/sectors are driving negative P&L and by how much
// 2. Market Divergence — compares portfolio return vs benchmark (e.g. NIFTY 50)
// 3. Concentration Drag — flags if portfolio is suffering from high concentration in falling assets
// 4. Crash vs Correction Gauge — evaluates India VIX, index trends, and crash probability
// 5. Recovery Horizon & Action Steps — estimates realistic turnaround timeframes and next actions

export type HoldingDiagnostic = {
  stock: string;
  displaySym: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number | null;
  cost: number;
  value: number | null;
  pl: number | null;
  plPct: number | null;
  sector?: string | null;
};

export type LossContributor = {
  symbol: string;
  pl: number;
  plPct: number;
  cost: number;
  value: number;
  lossContributionPct: number; // percentage of total gross loss
  isMajorDrag: boolean;
};

export type ProfitBuffer = {
  symbol: string;
  pl: number;
  plPct: number;
  profitContributionPct: number;
};

export type CrashRiskAssessment = {
  vix: number | null;
  vixStatus: "CALM" | "NORMAL_CORRECTION" | "HIGH_VOLATILITY" | "PANIC";
  crashProbabilityPct: number; // 0-100%
  marketPhase: "BULL_CONSOLIDATION" | "HEALTHY_CORRECTION" | "BEAR_MARKET" | "SYSTEMIC_CRASH_RISK";
  verdict: string;
  reasons: string[];
};

export type RecoveryPlan = {
  estimatedMonthsMin: number;
  estimatedMonthsMax: number;
  confidence: number;
  primaryDrivers: string[];
  actionSteps: string[];
  averagingRecommendation: string;
};

export type PortfolioLossDiagnosis = {
  totalInvested: number;
  totalCurrentValue: number;
  netPl: number;
  netPlPct: number;
  isInLoss: boolean;
  benchmark: {
    name: string;
    dayChangePct: number | null;
    divergencePct: number | null; // portfolio - benchmark
    explanation: string;
  };
  lossDrivers: LossContributor[];
  profitBuffers: ProfitBuffer[];
  concentrationRisk: {
    top2LossPctOfCapital: number;
    top2LossSymbols: string[];
    isOverConcentrated: boolean;
    warning: string | null;
  };
  crashRadar: CrashRiskAssessment;
  recoveryPlan: RecoveryPlan;
  keyTakeaway: string;
};

export function evaluateCrashRisk(input: {
  indiaVix: number | null;
  niftyDayChange: number | null;
  marketRiskScore?: number | null;
}): CrashRiskAssessment {
  const vix = input.indiaVix;
  let vixStatus: CrashRiskAssessment["vixStatus"] = "NORMAL_CORRECTION";
  let crashProbabilityPct = 18; // baseline healthy market probability
  const reasons: string[] = [];

  if (vix != null) {
    if (vix < 14) {
      vixStatus = "CALM";
      crashProbabilityPct = 12;
      reasons.push(`India VIX is at ${vix.toFixed(2)}, signaling institutional calm and steady market sentiment.`);
    } else if (vix <= 20) {
      vixStatus = "NORMAL_CORRECTION";
      crashProbabilityPct = 18;
      reasons.push(`India VIX is at ${vix.toFixed(2)} (14–20 range), which is normal for routine profit booking and sector rotation.`);
    } else if (vix <= 26) {
      vixStatus = "HIGH_VOLATILITY";
      crashProbabilityPct = 42;
      reasons.push(`India VIX is elevated at ${vix.toFixed(2)}, indicating hedging and heightened risk aversion.`);
    } else {
      vixStatus = "PANIC";
      crashProbabilityPct = 78;
      reasons.push(`India VIX is spiking at ${vix.toFixed(2)} (>26), indicating extreme volatility and panic unwinding.`);
    }
  } else {
    reasons.push("VIX index is currently unavailable; estimating from broader trend.");
  }

  if (input.niftyDayChange != null) {
    if (input.niftyDayChange >= 0) {
      reasons.push(`Benchmark index is holding positive (+${input.niftyDayChange.toFixed(2)}%), confirming no broad market capitulation.`);
    } else if (input.niftyDayChange > -1.5) {
      reasons.push(`Benchmark drop is mild (${input.niftyDayChange.toFixed(2)}%), typical of standard consolidation.`);
    } else {
      crashProbabilityPct = Math.min(95, crashProbabilityPct + 15);
      reasons.push(`Sharp single-day index decline (${input.niftyDayChange.toFixed(2)}%) reflecting short-term selling pressure.`);
    }
  }

  let marketPhase: CrashRiskAssessment["marketPhase"] = "HEALTHY_CORRECTION";
  let verdict = "Low probability of a systemic market crash. Market is undergoing routine consolidation.";

  if (crashProbabilityPct < 25) {
    marketPhase = "HEALTHY_CORRECTION";
    verdict = "Low systemic crash risk. Current price swings reflect sector rotations and healthy cooling, not an economic collapse.";
  } else if (crashProbabilityPct < 50) {
    marketPhase = "BULL_CONSOLIDATION";
    verdict = "Moderate volatility. Pullbacks are normal cyclical breathers in a larger structural bull cycle.";
  } else if (crashProbabilityPct < 70) {
    marketPhase = "BEAR_MARKET";
    verdict = "Elevated correction risk. Downside momentum is active; preserve capital and avoid aggressive leverage.";
  } else {
    marketPhase = "SYSTEMIC_CRASH_RISK";
    verdict = "Severe market stress detected. Defensive positioning and strict stop-losses recommended.";
  }

  return {
    vix,
    vixStatus,
    crashProbabilityPct,
    marketPhase,
    verdict,
    reasons,
  };
}

export function diagnosePortfolioLoss(input: {
  holdings: HoldingDiagnostic[];
  niftyDayChange?: number | null;
  indiaVix?: number | null;
  marketRiskScore?: number | null;
}): PortfolioLossDiagnosis {
  const { holdings, niftyDayChange = 0.52, indiaVix = 14.2, marketRiskScore = 35 } = input;

  const totalInvested = holdings.reduce((sum, h) => sum + h.cost, 0);
  const totalCurrentValue = holdings.reduce((sum, h) => sum + (h.value ?? h.cost), 0);
  const netPl = totalCurrentValue - totalInvested;
  const netPlPct = totalInvested > 0 ? (netPl / totalInvested) * 100 : 0;
  const isInLoss = netPl < 0;

  // Separate losing and profitable holdings
  const losingHoldings = holdings
    .filter((h) => (h.pl ?? 0) < 0)
    .sort((a, b) => (a.pl ?? 0) - (b.pl ?? 0)); // Most negative first

  const winningHoldings = holdings
    .filter((h) => (h.pl ?? 0) > 0)
    .sort((a, b) => (b.pl ?? 0) - (a.pl ?? 0));

  const totalGrossLoss = Math.abs(losingHoldings.reduce((sum, h) => sum + (h.pl ?? 0), 0));
  const totalGrossProfit = winningHoldings.reduce((sum, h) => sum + (h.pl ?? 0), 0);

  const lossDrivers: LossContributor[] = losingHoldings.map((h) => {
    const pl = h.pl ?? 0;
    const lossContributionPct = totalGrossLoss > 0 ? (Math.abs(pl) / totalGrossLoss) * 100 : 0;
    return {
      symbol: h.displaySym,
      pl,
      plPct: h.plPct ?? 0,
      cost: h.cost,
      value: h.value ?? h.cost,
      lossContributionPct: Number(lossContributionPct.toFixed(1)),
      isMajorDrag: lossContributionPct > 20,
    };
  });

  const profitBuffers: ProfitBuffer[] = winningHoldings.map((h) => {
    const pl = h.pl ?? 0;
    const profitContributionPct = totalGrossProfit > 0 ? (pl / totalGrossProfit) * 100 : 0;
    return {
      symbol: h.displaySym,
      pl,
      plPct: h.plPct ?? 0,
      profitContributionPct: Number(profitContributionPct.toFixed(1)),
    };
  });

  // Concentration drag analysis (capital allocation to top 2 losing stocks)
  const top2LosingCapital = lossDrivers.slice(0, 2).reduce((sum, d) => sum + d.cost, 0);
  const top2LossPctOfCapital = totalInvested > 0 ? (top2LosingCapital / totalInvested) * 100 : 0;
  const top2LossSymbols = lossDrivers.slice(0, 2).map((d) => d.symbol);
  const isOverConcentrated = top2LossPctOfCapital > 40;

  let concentrationWarning: string | null = null;
  if (isOverConcentrated && top2LossSymbols.length >= 2) {
    concentrationWarning = `High concentration risk: ${top2LossSymbols.join(" and ")} make up ${top2LossPctOfCapital.toFixed(1)}% of your total invested capital and drive ${(lossDrivers.slice(0, 2).reduce((s, d) => s + d.lossContributionPct, 0)).toFixed(1)}% of your losses.`;
  } else if (isOverConcentrated && top2LossSymbols.length === 1) {
    concentrationWarning = `High concentration risk: ${top2LossSymbols[0]} makes up ${top2LossPctOfCapital.toFixed(1)}% of your invested capital.`;
  }

  // Benchmark divergence (Portfolio vs NIFTY 50)
  const dayBench = niftyDayChange ?? 0;
  const divergencePct = Number((netPlPct - dayBench).toFixed(2));
  let divergenceExplanation = "";
  if (isInLoss && dayBench >= 0) {
    divergenceExplanation = `Your portfolio is down ${Math.abs(netPlPct).toFixed(1)}% even while the NIFTY 50 is up +${dayBench.toFixed(2)}%. This confirms your loss is due to stock/sector concentration (e.g. PSU/Defense pullbacks), NOT a broad market crash.`;
  } else if (isInLoss && dayBench < 0) {
    divergenceExplanation = `Both your portfolio and the broader index are down today, reflecting overall market consolidation.`;
  } else {
    divergenceExplanation = `Your portfolio is tracking stably against the benchmark index.`;
  }

  // Crash Radar
  const crashRadar = evaluateCrashRisk({
    indiaVix,
    niftyDayChange,
    marketRiskScore,
  });

  // Recovery Plan & Horizon
  const recoveryMonthsMin = isOverConcentrated ? 4 : 2;
  const recoveryMonthsMax = 8;
  const confidence = isOverConcentrated ? 72 : 80;

  const actionSteps: string[] = [];
  if (isOverConcentrated) {
    actionSteps.push(`Pause adding more capital to ${top2LossSymbols.join(" or ")} until their portfolio weight drops below 15-20% each.`);
  }
  actionSteps.push("Do not panic-sell fundamentally sound, debt-free or dividend-yielding stocks at cyclical lows.");
  actionSteps.push("Direct your next investments into diversified index ETFs (e.g. Nifty 50, Nifty Midcap) or lagging sectors like FMCG/Pharma to balance risk.");
  actionSteps.push("Set disciplined alert thresholds instead of watching tick-by-tick prices.");

  let averagingRecommendation = "Hold current positions. Only average down if allocation is below 10% of total capital.";
  if (top2LossPctOfCapital > 30) {
    averagingRecommendation = "Do NOT average down on your top losing stocks right now — you are already overweight in them. Focus on diversification.";
  }

  const primaryDrivers = lossDrivers.slice(0, 3).map((d) => `${d.symbol} (${d.lossContributionPct}% of loss)`);

  let keyTakeaway = "";
  if (isInLoss) {
    if (isOverConcentrated) {
      keyTakeaway = `You are down ${Math.abs(netPlPct).toFixed(1)}% (₹${Math.abs(netPl).toFixed(0)}) mainly because ${top2LossSymbols.join(" and ")} make up ${top2LossPctOfCapital.toFixed(0)}% of your capital. The broader market is safe (${crashRadar.crashProbabilityPct}% crash risk), and this is a cyclical consolidation rather than a crash. Expected recovery timeline: ${recoveryMonthsMin}–${recoveryMonthsMax} months.`;
    } else {
      keyTakeaway = `Your portfolio is down ${Math.abs(netPlPct).toFixed(1)}% due to normal market pullbacks across your holdings. Quality fundamentals remain intact; avoid emotional selling.`;
    }
  } else {
    keyTakeaway = `Your portfolio is in profit (+₹${netPl.toFixed(0)}, +${netPlPct.toFixed(1)}%). Continue maintaining diversification and profit trailing.`;
  }

  return {
    totalInvested: Number(totalInvested.toFixed(2)),
    totalCurrentValue: Number(totalCurrentValue.toFixed(2)),
    netPl: Number(netPl.toFixed(2)),
    netPlPct: Number(netPlPct.toFixed(2)),
    isInLoss,
    benchmark: {
      name: "NIFTY 50",
      dayChangePct: dayBench,
      divergencePct,
      explanation: divergenceExplanation,
    },
    lossDrivers,
    profitBuffers,
    concentrationRisk: {
      top2LossPctOfCapital: Number(top2LossPctOfCapital.toFixed(1)),
      top2LossSymbols,
      isOverConcentrated,
      warning: concentrationWarning,
    },
    crashRadar,
    recoveryPlan: {
      estimatedMonthsMin: recoveryMonthsMin,
      estimatedMonthsMax: recoveryMonthsMax,
      confidence,
      primaryDrivers,
      actionSteps,
      averagingRecommendation,
    },
    keyTakeaway,
  };
}
