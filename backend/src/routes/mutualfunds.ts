import express from "express";
import { prisma } from "../lib/prisma";
import { fundProvider } from "../lib/providers";
import { asyncHandler, ApiError, sourceMeta } from "../lib/http";
import { parse, v } from "../lib/validate";

const router = express.Router();

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
  asyncHandler(async (req, res) => {
    const items = await prisma.fundWatchItem.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } });
    return res.json(items);
  })
);

router.post(
  "/watchlist/mine",
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
  asyncHandler(async (req, res) => {
    await prisma.fundWatchItem.deleteMany({ where: { userId: req.user!.id, schemeCode: req.params.schemeCode } });
    return res.json({ success: true });
  })
);

export default router;
