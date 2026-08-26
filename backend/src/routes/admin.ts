import express from "express";
import { prisma } from "../lib/prisma";
import { marketDataProvider, newsProvider, fundProvider, ipoProvider, paymentProvider } from "../lib/providers";
import { listBrokers } from "../lib/providers";
import { asyncHandler, ApiError, paginate } from "../lib/http";
import { parse, v } from "../lib/validate";
import { requireAdmin } from "../middleware/auth";

const router = express.Router();
router.use(requireAdmin);

router.get(
  "/health",
  asyncHandler(async (_req, res) => {
    let dbOk = true;
    try {
      await prisma.user.count();
    } catch {
      dbOk = false;
    }
    return res.json({
      database: dbOk ? "OK" : "DOWN",
      providers: {
        marketData: marketDataProvider.id,
        news: newsProvider.id,
        funds: fundProvider.id,
        ipo: { id: ipoProvider.id, configured: ipoProvider.configured },
        payments: { id: paymentProvider.id, configured: paymentProvider.configured },
        brokers: listBrokers(),
      },
      timestamp: new Date().toISOString(),
    });
  })
);

router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, username: true, email: true, role: true, status: true, kycStatus: true, createdAt: true, lastLoginAt: true } });
    return res.json(paginate(users, page, pageSize));
  })
);

router.put(
  "/users/:id/status",
  asyncHandler(async (req, res) => {
    const { status } = parse({ status: v.enumOf(["ACTIVE", "SUSPENDED"] as const) }, req.body);
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { status } });
    return res.json({ id: user.id, status: user.status });
  })
);

router.put(
  "/users/:id/kyc",
  asyncHandler(async (req, res) => {
    const { kycStatus } = parse({ kycStatus: v.enumOf(["NOT_STARTED", "PENDING", "VERIFIED", "REJECTED"] as const) }, req.body);
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { kycStatus } });
    return res.json({ id: user.id, kycStatus: user.kycStatus });
  })
);

router.get(
  "/support-tickets",
  asyncHandler(async (req, res) => {
    const status = req.query.status as string | undefined;
    const tickets = await prisma.supportTicket.findMany({ where: status ? { status } : undefined, orderBy: { updatedAt: "desc" }, include: { messages: true } });
    return res.json(tickets);
  })
);

router.post(
  "/support-tickets/:id/reply",
  asyncHandler(async (req, res) => {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) throw ApiError.notFound("Ticket not found");
    const { message, status } = parse({ message: v.string({ min: 1, max: 3000 }), status: v.optional(v.enumOf(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const)) }, req.body);
    const [msg] = await prisma.$transaction([
      prisma.ticketMessage.create({ data: { ticketId: ticket.id, author: "SUPPORT", body: message } }),
      prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: status ?? ticket.status, updatedAt: new Date() } }),
    ]);
    return res.json(msg);
  })
);

router.get(
  "/audit-logs",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 2000 });
    return res.json(paginate(logs, page, pageSize));
  })
);

router.post(
  "/events",
  asyncHandler(async (req, res) => {
    const body = parse(
      {
        externalId: v.string({ min: 1, max: 120 }),
        type: v.enumOf(["EARNINGS", "DIVIDEND", "SPLIT", "BONUS", "IPO", "POLICY", "MACRO", "AGM"] as const),
        title: v.string({ min: 1, max: 200 }),
        symbol: v.optional(v.string({ max: 24 })),
        sector: v.optional(v.string({ max: 60 })),
        date: v.date(),
        detail: v.optional(v.string({ max: 2000 })),
        source: v.optional(v.string({ max: 120 })),
      },
      req.body
    );
    const event = await prisma.marketEvent.upsert({ where: { externalId: body.externalId }, update: body, create: body });
    return res.json(event);
  })
);

export default router;
