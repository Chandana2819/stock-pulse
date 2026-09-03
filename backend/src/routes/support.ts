import express from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, ApiError } from "../lib/http";
import { parse, v, sanitizeText } from "../lib/validate";
import { requireAuth } from "../middleware/auth";

const router = express.Router();

const FAQ = [
  { q: "How do I add money to my simulated wallet?", a: "Go to Payments > Deposit. If payments are not configured in this environment, the wallet starts with a simulated balance for practice trading." },
  { q: "Is trading on StockPulse real?", a: "By default, trades are simulated using a virtual wallet so you can practice without risk. Connecting a real broker under Settings > Brokers is required for real order placement." },
  { q: "How is the Market Risk score calculated?", a: "It combines index trend, volatility (India VIX), global markets and a sector-divergence proxy — see the breakdown on the dashboard by clicking 'show factors'." },
  { q: "Why can't I see IPO GMP data?", a: "This environment does not have a licensed IPO/GMP data feed connected, so that section is intentionally empty rather than showing fabricated numbers." },
  { q: "How do I connect my broker?", a: "Go to Settings > Brokers and choose a supported broker. You will be redirected to the broker's own login page — StockPulse never asks for your broker password." },
  { q: "Are the tax numbers official?", a: "No — the Tax & P&L section provides an estimate using simplified rules. Always confirm with a qualified tax professional before filing." },
];

router.get("/faq", (_req, res) => res.json({ faq: FAQ }));

router.get(
  "/tickets",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tickets = await prisma.supportTicket.findMany({ where: { userId: req.user!.id }, orderBy: { updatedAt: "desc" }, include: { messages: { orderBy: { createdAt: "asc" } } } });
    return res.json(tickets);
  })
);

router.post(
  "/tickets",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { subject, category, message } = parse(
      { subject: v.string({ min: 3, max: 150 }), category: v.withDefault(v.enumOf(["GENERAL", "PAYMENT", "BROKER", "DATA", "ACCOUNT", "BUG"] as const), "GENERAL"), message: v.string({ min: 1, max: 3000 }) },
      req.body
    );
    const ticket = await prisma.supportTicket.create({
      data: { userId: req.user!.id, subject, category, messages: { create: { author: "USER", body: sanitizeText(message) } } },
      include: { messages: true },
    });
    return res.json(ticket);
  })
);

router.post(
  "/tickets/:id/messages",
  requireAuth,
  asyncHandler(async (req, res) => {
    const ticket = await prisma.supportTicket.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!ticket) throw ApiError.notFound("Ticket not found");
    const { message } = parse({ message: v.string({ min: 1, max: 3000 }) }, req.body);
    const msg = await prisma.ticketMessage.create({ data: { ticketId: ticket.id, author: "USER", body: sanitizeText(message) } });
    await prisma.supportTicket.update({ where: { id: ticket.id }, data: { updatedAt: new Date() } });
    return res.json(msg);
  })
);

export default router;
