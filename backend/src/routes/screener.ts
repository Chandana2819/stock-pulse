import express from "express";
import { prisma } from "../lib/prisma";
import { runScreener, type ScreenerFilters } from "../lib/services/screener";
import { SECTOR_NAMES } from "../lib/universe";
import { asyncHandler, ApiError } from "../lib/http";
import { parse, v } from "../lib/validate";
import { requireAuth } from "../middleware/auth";

const router = express.Router();

const numOpt = v.optional(v.number());

function filtersFromQuery(q: Record<string, unknown>): ScreenerFilters {
  return parse(
    {
      marketCapMin: numOpt,
      marketCapMax: numOpt,
      peMax: numOpt,
      peMin: numOpt,
      pbMax: numOpt,
      roeMin: numOpt,
      roceMin: numOpt,
      debtToEquityMax: numOpt,
      revenueGrowthMin: numOpt,
      profitGrowthMin: numOpt,
      epsGrowthMin: numOpt,
      dividendYieldMin: numOpt,
      sector: v.optional(v.string({ max: 60 })),
      exchange: v.optional(v.enumOf(["NSE", "GLOBAL"] as const)),
      changePctMin: numOpt,
      changePctMax: numOpt,
    },
    q
  );
}

router.get(
  "/meta",
  asyncHandler(async (_req, res) => {
    return res.json({ sectors: SECTOR_NAMES });
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filters = filtersFromQuery(req.query as Record<string, unknown>);
    const rows = await runScreener(filters);
    return res.json({ count: rows.length, results: rows });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const filters = filtersFromQuery(req.body ?? {});
    const rows = await runScreener(filters);
    return res.json({ count: rows.length, results: rows });
  })
);

router.get(
  "/presets",
  requireAuth,
  asyncHandler(async (req, res) => {
    const presets = await prisma.screenerPreset.findMany({ where: { userId: req.user!.id }, orderBy: { updatedAt: "desc" } });
    return res.json(presets.map((p) => ({ ...p, filters: JSON.parse(p.filters) })));
  })
);

router.post(
  "/presets",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name } = parse({ name: v.string({ min: 1, max: 60 }) }, req.body ?? {});
    const filters = JSON.stringify(req.body?.filters ?? {});
    const preset = await prisma.screenerPreset.upsert({
      where: { userId_name: { userId: req.user!.id, name } },
      update: { filters },
      create: { userId: req.user!.id, name, filters },
    });
    return res.json({ ...preset, filters: JSON.parse(preset.filters) });
  })
);

router.delete(
  "/presets/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.screenerPreset.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    return res.json({ success: true });
  })
);

export default router;
