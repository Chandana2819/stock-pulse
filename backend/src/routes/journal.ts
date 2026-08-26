import express from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, ApiError } from "../lib/http";
import { parse, v, SYMBOL_RE, sanitizeText } from "../lib/validate";

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const journals = await prisma.journalEntry.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } });
    return res.json(journals);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parse(
      {
        stock: v.string({ min: 1, max: 24, pattern: SYMBOL_RE }),
        thesis: v.string({ min: 1, max: 2000 }),
        entryReason: v.optional(v.string({ max: 1000 })),
        expectedRisk: v.optional(v.string({ max: 1000 })),
        targetPrice: v.optional(v.number({ min: 0 })),
        stopLoss: v.optional(v.number({ min: 0 })),
        emotion: v.optional(v.enumOf(["CONFIDENT", "FOMO", "FEARFUL", "NEUTRAL"] as const)),
        entryPrice: v.optional(v.number({ min: 0 })),
      },
      req.body
    );

    const entry = await prisma.journalEntry.create({
      data: {
        userId: req.user!.id,
        stock: body.stock.toUpperCase(),
        thesis: sanitizeText(body.thesis),
        entryReason: body.entryReason ? sanitizeText(body.entryReason) : undefined,
        expectedRisk: body.expectedRisk ? sanitizeText(body.expectedRisk) : undefined,
        targetPrice: body.targetPrice,
        stopLoss: body.stopLoss,
        emotion: body.emotion,
        entryPrice: body.entryPrice,
        status: "OPEN",
      },
    });
    return res.json(entry);
  })
);

router.put(
  "/",
  asyncHandler(async (req, res) => {
    const body = parse(
      {
        id: v.string({ min: 1 }),
        status: v.enumOf(["OPEN", "CLOSED"] as const),
        notes: v.optional(v.string({ max: 2000 })),
        exitReason: v.optional(v.string({ max: 1000 })),
        exitPrice: v.optional(v.number({ min: 0 })),
        outcome: v.optional(v.enumOf(["WIN", "LOSS", "FLAT"] as const)),
      },
      req.body
    );

    const existing = await prisma.journalEntry.findFirst({ where: { id: body.id, userId: req.user!.id } });
    if (!existing) throw ApiError.notFound("Journal entry not found");

    const entry = await prisma.journalEntry.update({
      where: { id: body.id },
      data: {
        status: body.status,
        notes: body.notes ? sanitizeText(body.notes) : undefined,
        exitReason: body.exitReason ? sanitizeText(body.exitReason) : undefined,
        exitPrice: body.exitPrice,
        outcome: body.outcome,
        closedAt: body.status === "CLOSED" ? new Date() : null,
      },
    });
    return res.json(entry);
  })
);

export default router;
