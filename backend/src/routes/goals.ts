import express from "express";
import { prisma } from "../lib/prisma";
import { requiredMonthlySip, sipFutureValue, scenarioBand, inflationAdjusted } from "../lib/finance";
import { asyncHandler, ApiError } from "../lib/http";
import { parse, v } from "../lib/validate";
import { requireAuth } from "../middleware/auth";
import { getBacktestedTrackRecord } from "../lib/services/trackRecord";
import { getEnrichedHoldings, computePortfolioXirr } from "../lib/services/portfolio";
import { getFundRecommendations, suggestCategoryForGoal } from "../lib/services/fundRecommendations";
import { FUND_CATEGORY_LABELS } from "../lib/mfUniverse";

const router = express.Router();
router.use(requireAuth);

const BACKTEST_WINDOW_YEARS = 2; // must match BACKTEST_WINDOW_DAYS in trackRecord.ts (730 days)

export type GoalFeasibility = {
  expectedReturnPct: number;
  niftyAnnualizedPct: number | null;
  benchmarkWindowLabel: string;
  realPortfolioXirrPct: number | null;
  classification: "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE" | "UNREALISTIC" | "UNKNOWN";
  explanation: string;
  capitalPreservationNote: string | null;
};

// Checks the goal's assumed annual return against real benchmarks rather than
// either trusting the user's number blindly or inventing a "safe" figure:
// the backtested NIFTY 50 return the Track Record feature computes from
// actual historical prices, and — when the goal is linked to the user's own
// portfolio — that portfolio's own real XIRR (from its actual buy/sell
// history, not a guess). The point isn't to promise the goal is reachable or
// to rule out a loss — no honest system can do that — it's to say plainly
// when a target implies real, historically-unsupported risk, so the user can
// choose to extend the timeline or lower the target instead of chasing it.
export async function assessGoalFeasibility(expectedReturnPct: number, realPortfolioXirrPct: number | null = null): Promise<GoalFeasibility> {
  let niftyAnnualizedPct: number | null = null;
  let benchmarkWindowLabel = `Last ${BACKTEST_WINDOW_YEARS} years`;
  try {
    const { value: bt } = await getBacktestedTrackRecord();
    benchmarkWindowLabel = bt.windowLabel;
    if (bt.benchmarkReturn != null) {
      niftyAnnualizedPct = (Math.pow(1 + bt.benchmarkReturn / 100, 1 / BACKTEST_WINDOW_YEARS) - 1) * 100;
    }
  } catch {}

  if (niftyAnnualizedPct == null) {
    return {
      expectedReturnPct,
      niftyAnnualizedPct: null,
      benchmarkWindowLabel,
      realPortfolioXirrPct,
      classification: "UNKNOWN",
      explanation: "Real market benchmark data isn't available right now, so this target couldn't be checked against actual history.",
      capitalPreservationNote: null,
    };
  }

  // Floor the comparison baseline so a down-market benchmark window doesn't
  // make every positive target look extreme by comparison.
  const floor = Math.max(niftyAnnualizedPct, 8);
  const ratio = expectedReturnPct / floor;
  const niftyStr = `${niftyAnnualizedPct >= 0 ? "+" : ""}${niftyAnnualizedPct.toFixed(1)}%/year`;
  const windowLc = benchmarkWindowLabel.toLowerCase();

  let classification: GoalFeasibility["classification"];
  let explanation: string;
  let capitalPreservationNote: string | null = null;

  if (ratio <= 1) {
    classification = "CONSERVATIVE";
    explanation = `${expectedReturnPct}%/year is at or below NIFTY 50's real annualized return over the ${windowLc} (${niftyStr}) — a reasonable, lower-risk assumption.`;
  } else if (ratio <= 2) {
    classification = "MODERATE";
    explanation = `${expectedReturnPct}%/year is above NIFTY 50's real recent return (${niftyStr}), but within range of what a diversified, actively-managed approach has historically reached.`;
  } else if (ratio <= 4) {
    classification = "AGGRESSIVE";
    explanation = `${expectedReturnPct}%/year is well above NIFTY 50's real recent return (${niftyStr}) — reachable only by taking on meaningfully more risk than the broad market.`;
    capitalPreservationNote = "Chasing this target raises the chance of a real loss along the way. Consider a longer timeline or a lower target rather than taking on positions outside your risk tolerance.";
  } else {
    classification = "UNREALISTIC";
    explanation = `${expectedReturnPct}%/year has no real historical basis here — NIFTY 50 actually returned ${niftyStr} over the ${windowLc}. A target this far above real market performance usually isn't reachable without extreme, concentrated risk.`;
    capitalPreservationNote = "This target is unlikely to be reachable without risk levels that could produce a real loss. Consider a longer timeline or a lower target.";
  }

  // When the goal is linked to the user's actual portfolio, add their own
  // real historical return as a second, more personal anchor alongside the
  // market benchmark — computed from actual buy/sell transactions (XIRR),
  // never a projection of what it will do next.
  if (realPortfolioXirrPct != null) {
    const xirrStr = `${realPortfolioXirrPct >= 0 ? "+" : ""}${realPortfolioXirrPct.toFixed(1)}%/year`;
    explanation += ` Your own linked portfolio's real return to date (XIRR) is ${xirrStr} — ${
      expectedReturnPct <= realPortfolioXirrPct
        ? "your target is at or below what you've actually achieved so far."
        : "your target is above what you've actually achieved so far, so it would require your portfolio to perform better than its own track record."
    }`;
  }

  return { expectedReturnPct, niftyAnnualizedPct: Number(niftyAnnualizedPct.toFixed(2)), benchmarkWindowLabel, realPortfolioXirrPct, classification, explanation, capitalPreservationNote };
}

async function project(goal: {
  userId: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: Date;
  monthlyContribution: number;
  expectedReturn: number;
  inflationRate: number;
  linkedToPortfolio: boolean;
}) {
  // When linked, the goal's "current amount" is derived live from the user's
  // actual holdings (real live prices, same valuation the Portfolio page
  // uses) instead of a manually-typed, easily-stale number.
  let currentAmount = goal.currentAmount;
  let linkedPortfolio: { currentValue: number; realXirrPct: number | null; holdingsCount: number } | null = null;

  if (goal.linkedToPortfolio) {
    const [holdings, realXirrPct] = await Promise.all([
      getEnrichedHoldings(goal.userId),
      computePortfolioXirr(goal.userId).catch(() => null),
    ]);
    const currentValue = holdings.reduce((sum, h) => sum + (h.value ?? 0), 0);
    currentAmount = currentValue;
    linkedPortfolio = {
      currentValue: Math.round(currentValue),
      realXirrPct: realXirrPct != null ? Number(realXirrPct.toFixed(2)) : null,
      holdingsCount: holdings.length,
    };
  }

  const years = Math.max(0.01, (goal.targetDate.getTime() - Date.now()) / (365 * 24 * 3600 * 1000));
  const band = scenarioBand(goal.expectedReturn);
  const requiredMonthly = requiredMonthlySip(goal.targetAmount, goal.expectedReturn, years, currentAmount);
  const projectedAtCurrentContribution = sipFutureValue(goal.monthlyContribution, goal.expectedReturn, years).futureValue + currentAmount;
  const inflationAdjustedTarget = inflationAdjusted(goal.targetAmount, goal.inflationRate, years);
  const feasibility = await assessGoalFeasibility(goal.expectedReturn, linkedPortfolio?.realXirrPct ?? null);

  // A suggested fund category for this goal's horizon + how aggressive its
  // assumed return is — not a forecast of which fund performs best, just a
  // real-data-backed starting point matched to the same feasibility check
  // above, with the actual top-ranked real funds in that category attached.
  const suggestion = suggestCategoryForGoal(years, feasibility.classification);
  const { funds: suggestedFunds } = await getFundRecommendations(suggestion.category).catch(() => ({ funds: [] }));
  const fundSuggestion = {
    category: suggestion.category,
    categoryLabel: FUND_CATEGORY_LABELS[suggestion.category],
    reason: suggestion.reason,
    topFunds: suggestedFunds.slice(0, 3),
  };

  return {
    years: Number(years.toFixed(2)),
    currentAmount: Math.round(currentAmount),
    progressPct: goal.targetAmount > 0 ? Math.min(100, (currentAmount / goal.targetAmount) * 100) : 0,
    requiredMonthlyInvestment: requiredMonthly != null ? Math.round(requiredMonthly) : null,
    projectedAtCurrentContribution: Math.round(projectedAtCurrentContribution),
    onTrack: requiredMonthly != null ? goal.monthlyContribution >= requiredMonthly * 0.95 : null,
    inflationAdjustedTarget: Math.round(inflationAdjustedTarget),
    scenarios: {
      bear: Math.round(sipFutureValue(goal.monthlyContribution, band.bear, years).futureValue + currentAmount),
      base: Math.round(sipFutureValue(goal.monthlyContribution, band.base, years).futureValue + currentAmount),
      bull: Math.round(sipFutureValue(goal.monthlyContribution, band.bull, years).futureValue + currentAmount),
    },
    assumptions: { expectedReturnPct: goal.expectedReturn, inflationRatePct: goal.inflationRate, note: "Projections are illustrative estimates based on the assumed annual return — not a guarantee of future performance." },
    feasibility,
    linkedPortfolio,
    fundSuggestion,
  };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const goals = await prisma.goal.findMany({ where: { userId: req.user!.id }, orderBy: { targetDate: "asc" } });
    const withProjections = await Promise.all(goals.map(async (g) => ({ ...g, projection: await project(g) })));
    return res.json(withProjections);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parse(
      {
        name: v.string({ min: 1, max: 80 }),
        category: v.withDefault(v.enumOf(["EMERGENCY", "CAR", "HOUSE", "EDUCATION", "RETIREMENT", "VACATION", "WEALTH"] as const), "WEALTH"),
        targetAmount: v.number({ min: 1 }),
        currentAmount: v.withDefault(v.number({ min: 0 }), 0),
        targetDate: v.date(),
        monthlyContribution: v.withDefault(v.number({ min: 0 }), 0),
        expectedReturn: v.withDefault(v.number({ min: 0, max: 40 }), 12),
        inflationRate: v.withDefault(v.number({ min: 0, max: 20 }), 6),
        priority: v.withDefault(v.enumOf(["LOW", "MEDIUM", "HIGH"] as const), "MEDIUM"),
        linkedToPortfolio: v.withDefault(v.boolean(), false),
      },
      req.body
    );
    const goal = await prisma.goal.create({ data: { userId: req.user!.id, ...body } });
    return res.json({ ...goal, projection: await project(goal) });
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.goal.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) throw ApiError.notFound("Goal not found");
    const body = parse(
      {
        name: v.optional(v.string({ min: 1, max: 80 })),
        currentAmount: v.optional(v.number({ min: 0 })),
        targetAmount: v.optional(v.number({ min: 1 })),
        targetDate: v.optional(v.date()),
        monthlyContribution: v.optional(v.number({ min: 0 })),
        expectedReturn: v.optional(v.number({ min: 0, max: 40 })),
        inflationRate: v.optional(v.number({ min: 0, max: 20 })),
        priority: v.optional(v.enumOf(["LOW", "MEDIUM", "HIGH"] as const)),
        linkedToPortfolio: v.optional(v.boolean()),
      },
      req.body
    );
    const goal = await prisma.goal.update({ where: { id: existing.id }, data: body });
    return res.json({ ...goal, projection: await project(goal) });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.goal.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    return res.json({ success: true });
  })
);

export default router;
