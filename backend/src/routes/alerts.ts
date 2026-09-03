import express from "express";
import { prisma } from "../lib/prisma";
import { evaluateAlertsForUser } from "../lib/services/alerts";
import { asyncHandler, ApiError } from "../lib/http";
import { parse, v, SYMBOL_RE } from "../lib/validate";
import { requireAuth } from "../middleware/auth";

const router = express.Router();
router.use(requireAuth);

const ALERT_TYPES = ["PRICE_ABOVE", "PRICE_BELOW", "PCT_MOVE", "VOLUME_SPIKE", "RSI_ABOVE", "RSI_BELOW", "NEWS", "MARKET_RISK", "PORTFOLIO_LOSS", "CONCENTRATION"] as const;

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const alerts = await prisma.alert.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" }, include: { triggers: { orderBy: { createdAt: "desc" }, take: 5 } } });
    return res.json(alerts.map((a) => ({ ...a, channels: JSON.parse(a.channels || "[]") })));
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parse(
      {
        symbol: v.optional(v.string({ min: 1, max: 24, pattern: SYMBOL_RE })),
        type: v.enumOf(ALERT_TYPES),
        threshold: v.optional(v.number()),
        channels: v.withDefault(v.stringArray({ max: 4 }), ["IN_APP"]),
        note: v.optional(v.string({ max: 300 })),
      },
      req.body
    );
    const alert = await prisma.alert.create({
      data: { userId: req.user!.id, symbol: body.symbol?.toUpperCase(), type: body.type, threshold: body.threshold, channels: JSON.stringify(body.channels), note: body.note },
    });
    return res.json({ ...alert, channels: body.channels });
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.alert.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) throw ApiError.notFound("Alert not found");
    const body = parse({ active: v.optional(v.boolean()), threshold: v.optional(v.number()), note: v.optional(v.string({ max: 300 })) }, req.body);
    const alert = await prisma.alert.update({ where: { id: existing.id }, data: body });
    return res.json({ ...alert, channels: JSON.parse(alert.channels || "[]") });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.alert.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    return res.json({ success: true });
  })
);

router.post(
  "/check-now",
  asyncHandler(async (req, res) => {
    const result = await evaluateAlertsForUser(req.user!.id);
    return res.json(result);
  })
);

export default router;
