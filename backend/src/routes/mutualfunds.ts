import express from "express";
import { prisma } from "../lib/prisma";
import { fundProvider } from "../lib/providers";
import { asyncHandler, ApiError, sourceMeta } from "../lib/http";
import { parse, v } from "../lib/validate";
import { requireAuth } from "../middleware/auth";
import { getFundRecommendations, suggestCategoryForGoal } from "../lib/services/fundRecommendations";
import { FUND_CATEGORY_LABELS, type FundCategory } from "../lib/mfUniverse";
import { assessGoalFeasibility } from "./goals";

const router = express.Router();

// Goal-first suggestion: instead of a flat "top funds per category" list, ask
// for the same two inputs the Goals feature already uses (timeline + assumed
// return) and reuse its real-benchmark feasibility check + category heuristic
// — so a standalone visitor to the Mutual Funds page gets the same honest,
// explainable suggestion a linked Goal would produce, without having to
// create a Goal first.
router.get(
  "/suggest-for-goal",
  asyncHandler(async (req, res) => {
    const { years, expectedReturnPct } = parse(
      { years: v.number({ min: 0.1, max: 50 }), expectedReturnPct: v.number({ min: -50, max: 200 }) },
      req.query as Record<string, unknown>
    );
    const feasibility = await assessGoalFeasibility(expectedReturnPct);
    const suggestion = suggestCategoryForGoal(years, feasibility.classification);
    const { funds } = await getFundRecommendations(suggestion.category);
    return res.json({
      category: suggestion.category,
      categoryLabel: FUND_CATEGORY_LABELS[suggestion.category],
      reason: suggestion.reason,
      feasibility,
      funds,
      meta: sourceMeta(fundProvider.id),
    });
  })
);

router.get(
  "/recommendations",
  asyncHandler(async (req, res) => {
    const categoryParam = req.query.category ? String(req.query.category).toUpperCase() : undefined;
    const category = categoryParam && categoryParam in FUND_CATEGORY_LABELS ? (categoryParam as FundCategory) : undefined;
    const { funds, byCategory } = await getFundRecommendations(category);
    return res.json({
      funds,
      byCategory,
      categories: FUND_CATEGORY_LABELS,
      meta: { ...sourceMeta(fundProvider.id), note: "Ranked by real trailing 3-year (annualised) return on a curated set of well-known schemes — past performance, not a guarantee of future returns." },
    });
  })
);

router.get(
  "/search",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (!q) return res.json({ results: [] });
    const results = await fundProvider.search(q, 20);
    return res.json({ results, meta: sourceMeta(fundProvider.id) });
  })
);

router.get(
  "/:schemeCode",
  asyncHandler(async (req, res) => {
    const detail = await fundProvider.getScheme(req.params.schemeCode);
    if (!detail) throw ApiError.notFound("Fund scheme not found");
    return res.json({ ...detail, meta: sourceMeta(fundProvider.id) });
  })
);

router.get(
  "/:schemeCode/sip-projection",
  asyncHandler(async (req, res) => {
    const { monthly, years } = parse({ monthly: v.number({ min: 1 }), years: v.number({ min: 0.1, max: 50 }) }, req.query as Record<string, unknown>);
    const detail = await fundProvider.getScheme(req.params.schemeCode);
    if (!detail) throw ApiError.notFound("Fund scheme not found");
    const assumedReturn = detail.returns.threeYear ?? detail.returns.oneYear ?? 10;
    const { sipFutureValue } = await import("../lib/finance");
    const projection = sipFutureValue(monthly, assumedReturn, years);
    return res.json({ assumedAnnualReturnPct: Number(assumedReturn.toFixed(2)), ...projection, note: "Projection uses the fund's own trailing return as the assumption — not a promise of future performance." });
  })
);

router.get(
  "/watchlist/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const items = await prisma.fundWatchItem.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } });
    return res.json(items);
  })
);

router.post(
  "/watchlist/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { schemeCode, schemeName, kind } = parse(
      { schemeCode: v.string({ min: 1, max: 20 }), schemeName: v.string({ min: 1, max: 200 }), kind: v.withDefault(v.enumOf(["MUTUAL_FUND", "ETF"] as const), "MUTUAL_FUND") },
      req.body
    );
    const item = await prisma.fundWatchItem.upsert({
      where: { userId_schemeCode: { userId: req.user!.id, schemeCode } },
      update: {},
      create: { userId: req.user!.id, schemeCode, schemeName, kind },
    });
    return res.json(item);
  })
);

router.delete(
  "/watchlist/mine/:schemeCode",
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.fundWatchItem.deleteMany({ where: { userId: req.user!.id, schemeCode: req.params.schemeCode } });
    return res.json({ success: true });
  })
);

export default router;
