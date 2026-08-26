import express from "express";
import { prisma } from "../lib/prisma";
import { requiredMonthlySip, sipFutureValue, scenarioBand, inflationAdjusted } from "../lib/finance";
import { asyncHandler, ApiError } from "../lib/http";
import { parse, v } from "../lib/validate";

const router = express.Router();

function project(goal: { targetAmount: number; currentAmount: number; targetDate: Date; monthlyContribution: number; expectedReturn: number; inflationRate: number }) {
  const years = Math.max(0.01, (goal.targetDate.getTime() - Date.now()) / (365 * 24 * 3600 * 1000));
  const band = scenarioBand(goal.expectedReturn);
  const requiredMonthly = requiredMonthlySip(goal.targetAmount, goal.expectedReturn, years, goal.currentAmount);
  const projectedAtCurrentContribution = sipFutureValue(goal.monthlyContribution, goal.expectedReturn, years).futureValue + goal.currentAmount;
  const inflationAdjustedTarget = inflationAdjusted(goal.targetAmount, goal.inflationRate, years);

  return {
    years: Number(years.toFixed(2)),
    progressPct: goal.targetAmount > 0 ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) : 0,
    requiredMonthlyInvestment: requiredMonthly != null ? Math.round(requiredMonthly) : null,
    projectedAtCurrentContribution: Math.round(projectedAtCurrentContribution),
    onTrack: requiredMonthly != null ? goal.monthlyContribution >= requiredMonthly * 0.95 : null,
    inflationAdjustedTarget: Math.round(inflationAdjustedTarget),
    scenarios: {
      bear: Math.round(sipFutureValue(goal.monthlyContribution, band.bear, years).futureValue + goal.currentAmount),
      base: Math.round(sipFutureValue(goal.monthlyContribution, band.base, years).futureValue + goal.currentAmount),
      bull: Math.round(sipFutureValue(goal.monthlyContribution, band.bull, years).futureValue + goal.currentAmount),
    },
    assumptions: { expectedReturnPct: goal.expectedReturn, inflationRatePct: goal.inflationRate, note: "Projections are illustrative estimates based on the assumed annual return — not a guarantee of future performance." },
  };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const goals = await prisma.goal.findMany({ where: { userId: req.user!.id }, orderBy: { targetDate: "asc" } });
    return res.json(goals.map((g) => ({ ...g, projection: project(g) })));
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
      },
      req.body
    );
    const goal = await prisma.goal.create({ data: { userId: req.user!.id, ...body } });
    return res.json({ ...goal, projection: project(goal) });
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
      },
      req.body
    );
    const goal = await prisma.goal.update({ where: { id: existing.id }, data: body });
    return res.json({ ...goal, projection: project(goal) });
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
