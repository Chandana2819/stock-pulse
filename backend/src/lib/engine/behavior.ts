// Investor behavior analytics.
//
// Reads a user's own transaction history and journal entries and surfaces
// patterns — panic-selling after small dips, buying right after big rallies,
// holding losers too long — the same things a good coach would notice. Tone is
// deliberately non-judgmental: this is meant to educate, not shame.

export type TxLite = { stock: string; type: "BUY" | "SELL"; price: number; quantity: number; createdAt: Date };

export type BehaviorProfile = {
  riskTolerance: "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE";
  strengths: string[];
  patterns: { title: string; detail: string; count: number }[];
  improvementTips: string[];
  stats: {
    totalTrades: number;
    avgHoldingDays: number | null;
    buyAfterRallyCount: number;
    sellAfterDipCount: number;
    winRate: number | null;
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function analyzeBehavior(transactions: TxLite[], declaredRiskTolerance: BehaviorProfile["riskTolerance"] = "MODERATE"): BehaviorProfile {
  const sorted = [...transactions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const byStock = new Map<string, TxLite[]>();
  for (const t of sorted) {
    const list = byStock.get(t.stock) ?? [];
    list.push(t);
    byStock.set(t.stock, list);
  }

  let holdingDaysSum = 0;
  let holdingDaysCount = 0;
  let wins = 0;
  let completedRoundTrips = 0;
  let sellAfterDipCount = 0;
  let buyAfterRallyCount = 0;

  for (const [, list] of byStock) {
    const lots: TxLite[] = [];
    for (let i = 0; i < list.length; i++) {
      const tx = list[i];
      if (tx.type === "BUY") {
        lots.push(tx);
        // Was this buy made right after a run-up in the same stock's own trades? We
        // approximate "rally" using the prior trade's price if it exists.
        const prevTx = list[i - 1];
        if (prevTx && tx.price > prevTx.price * 1.05) buyAfterRallyCount++;
      } else {
        const lot = lots.shift();
        if (lot) {
          const holdingDays = (tx.createdAt.getTime() - lot.createdAt.getTime()) / DAY_MS;
          holdingDaysSum += holdingDays;
          holdingDaysCount++;
          completedRoundTrips++;
          if (tx.price > lot.price) wins++;
          // Sold at a loss, and did so within 5 days of buying: a plausible
          // panic-sell-on-a-dip pattern rather than a considered exit.
          if (tx.price < lot.price * 0.98 && holdingDays <= 5) sellAfterDipCount++;
        }
      }
    }
  }

  const strengths: string[] = [];
  const patterns: BehaviorProfile["patterns"] = [];
  const tips: string[] = [];

  const avgHoldingDays = holdingDaysCount > 0 ? Math.round(holdingDaysSum / holdingDaysCount) : null;
  if (avgHoldingDays != null && avgHoldingDays >= 30) strengths.push("Long-term holding — you let positions play out rather than trading reactively");
  if (avgHoldingDays != null && avgHoldingDays < 5 && completedRoundTrips >= 3) {
    patterns.push({ title: "Short average holding period", detail: `Average holding period is about ${avgHoldingDays} day(s), which is closer to trading than investing.`, count: completedRoundTrips });
    tips.push("Consider whether each sale is driven by a change in thesis or just short-term price noise.");
  }

  if (sellAfterDipCount >= 2) {
    patterns.push({
      title: "Selling after temporary declines",
      detail: `You sold ${sellAfterDipCount} position(s) at a loss within 5 days of buying — a pattern consistent with reacting to short-term dips rather than a change in thesis.`,
      count: sellAfterDipCount,
    });
    tips.push("Before selling on a dip, revisit your original journal thesis — has anything actually changed, or just the price?");
  }

  if (buyAfterRallyCount >= 2) {
    patterns.push({
      title: "Buying after sharp rallies",
      detail: `${buyAfterRallyCount} of your buys followed a >5% jump in that stock's price — a pattern consistent with chasing momentum (FOMO).`,
      count: buyAfterRallyCount,
    });
    tips.push("Waiting for a pullback or confirmation, instead of buying immediately after a spike, can improve your average entry price.");
  }

  const winRate = completedRoundTrips > 0 ? Math.round((wins / completedRoundTrips) * 100) : null;
  if (winRate != null && winRate >= 60) strengths.push(`${winRate}% of your closed trades were profitable`);

  if (strengths.length === 0) strengths.push("Not enough closed trades yet to identify a clear strength — keep journaling your theses");
  if (tips.length === 0) tips.push("No concerning patterns detected in your recent trading — keep documenting your thesis for every trade in the journal");

  return {
    riskTolerance: declaredRiskTolerance,
    strengths,
    patterns,
    improvementTips: tips,
    stats: {
      totalTrades: transactions.length,
      avgHoldingDays,
      buyAfterRallyCount,
      sellAfterDipCount,
      winRate,
    },
  };
}
