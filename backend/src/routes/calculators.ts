import express from "express";
import { sipFutureValue, lumpsumFutureValue, requiredMonthlySip, inflationAdjusted, cagr, xirr } from "../lib/finance";
import { asyncHandler } from "../lib/http";
import { parse, v } from "../lib/validate";

const router = express.Router();

router.get(
  "/sip",
  asyncHandler(async (req, res) => {
    const { monthly, annualReturn, years, stepUpPct } = parse(
      { monthly: v.number({ min: 1 }), annualReturn: v.number({ min: -50, max: 100 }), years: v.number({ min: 0.1, max: 60 }), stepUpPct: v.withDefault(v.number({ min: 0, max: 50 }), 0) },
      req.query as Record<string, unknown>
    );
    return res.json(sipFutureValue(monthly, annualReturn, years, stepUpPct));
  })
);

router.get(
  "/lumpsum",
  asyncHandler(async (req, res) => {
    const { amount, annualReturn, years } = parse(
      { amount: v.number({ min: 1 }), annualReturn: v.number({ min: -50, max: 100 }), years: v.number({ min: 0.1, max: 60 }) },
      req.query as Record<string, unknown>
    );
    return res.json(lumpsumFutureValue(amount, annualReturn, years));
  })
);

router.get(
  "/required-sip",
  asyncHandler(async (req, res) => {
    const { target, annualReturn, years, currentCorpus } = parse(
      { target: v.number({ min: 1 }), annualReturn: v.number({ min: -50, max: 100 }), years: v.number({ min: 0.1, max: 60 }), currentCorpus: v.withDefault(v.number({ min: 0 }), 0) },
      req.query as Record<string, unknown>
    );
    const monthly = requiredMonthlySip(target, annualReturn, years, currentCorpus);
    return res.json({ requiredMonthlySip: monthly != null ? Math.round(monthly) : null });
  })
);

router.get(
  "/inflation",
  asyncHandler(async (req, res) => {
    const { amount, inflationPct, years } = parse(
      { amount: v.number({ min: 0 }), inflationPct: v.withDefault(v.number({ min: 0, max: 30 }), 6), years: v.number({ min: 0.1, max: 60 }) },
      req.query as Record<string, unknown>
    );
    return res.json({ futureCost: Math.round(inflationAdjusted(amount, inflationPct, years)) });
  })
);

router.get(
  "/retirement",
  asyncHandler(async (req, res) => {
    const { currentAge, retireAge, monthlyExpenseToday, inflationPct, postRetirementReturnPct, preRetirementReturnPct, lifeExpectancy } = parse(
      {
        currentAge: v.number({ min: 15, max: 80, int: true }),
        retireAge: v.number({ min: 30, max: 80, int: true }),
        monthlyExpenseToday: v.number({ min: 0 }),
        inflationPct: v.withDefault(v.number({ min: 0, max: 20 }), 6),
        postRetirementReturnPct: v.withDefault(v.number({ min: 0, max: 30 }), 7),
        preRetirementReturnPct: v.withDefault(v.number({ min: 0, max: 30 }), 12),
        lifeExpectancy: v.withDefault(v.number({ min: 40, max: 110, int: true }), 85),
      },
      req.query as Record<string, unknown>
    );

    const yearsToRetire = retireAge - currentAge;
    const yearsInRetirement = Math.max(1, lifeExpectancy - retireAge);
    const monthlyExpenseAtRetirement = inflationAdjusted(monthlyExpenseToday, inflationPct, yearsToRetire);
    const annualExpenseAtRetirement = monthlyExpenseAtRetirement * 12;

    // Real return during retirement (post-return minus inflation) used to size the corpus needed to sustain withdrawals.
    const realReturn = (1 + postRetirementReturnPct / 100) / (1 + inflationPct / 100) - 1;
    const corpusNeeded =
      realReturn > 0.0001
        ? annualExpenseAtRetirement * ((1 - Math.pow(1 + realReturn, -yearsInRetirement)) / realReturn)
        : annualExpenseAtRetirement * yearsInRetirement;

    const requiredMonthly = requiredMonthlySip(corpusNeeded, preRetirementReturnPct, yearsToRetire, 0);

    return res.json({
      yearsToRetire,
      yearsInRetirement,
      monthlyExpenseAtRetirement: Math.round(monthlyExpenseAtRetirement),
      corpusNeeded: Math.round(corpusNeeded),
      requiredMonthlySip: requiredMonthly != null ? Math.round(requiredMonthly) : null,
      assumptions: { inflationPct, postRetirementReturnPct, preRetirementReturnPct, lifeExpectancy },
    });
  })
);

router.post(
  "/xirr",
  asyncHandler(async (req, res) => {
    const flows = Array.isArray(req.body?.flows) ? req.body.flows : [];
    const parsed = flows.map((f: { date: string; amount: number }) => ({ date: new Date(f.date), amount: Number(f.amount) }));
    return res.json({ xirrPct: xirr(parsed) });
  })
);

router.get(
  "/cagr",
  asyncHandler(async (req, res) => {
    const { begin, end, years } = parse({ begin: v.number({ min: 0.01 }), end: v.number({ min: 0 }), years: v.number({ min: 0.01, max: 60 }) }, req.query as Record<string, unknown>);
    return res.json({ cagrPct: cagr(begin, end, years) });
  })
);

export default router;
