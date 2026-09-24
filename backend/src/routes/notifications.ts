import express from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, paginate } from "../lib/http";
import { parse, v } from "../lib/validate";
import { requireAuth } from "../middleware/auth";

const router = express.Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const category = req.query.category as string | undefined;
    const unreadOnly = req.query.unread === "true";
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 30));

    const where = {
      userId: req.user!.id,
      ...(category ? { category } : {}),
      ...(unreadOnly ? { readAt: null } : {}),
    };
    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: "desc" } }),
      prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
    ]);
    return res.json({ ...paginate(items, page, pageSize), unreadCount });
  })
);

router.post(
  "/:id/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user!.id }, data: { readAt: new Date() } });
    return res.json({ success: true });
  })
);

router.post(
  "/read-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
    return res.json({ success: true });
  })
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.notification.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    return res.json({ success: true });
  })
);

export default router;

// ── Web Push Subscription endpoints ─────────────────────────────────────────

router.post(
  "/push-subscribe",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { endpoint, keys } = req.body as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "Invalid subscription payload" });
    }
    const userAgent = req.headers["user-agent"] ?? null;
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh: keys.p256dh, auth: keys.auth, userAgent, userId: req.user!.id },
      create: { userId: req.user!.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    });
    return res.json({ success: true });
  })
);

router.delete(
  "/push-unsubscribe",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { endpoint } = req.body as { endpoint: string };
    if (!endpoint) return res.status(400).json({ error: "endpoint required" });
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user!.id } });
    return res.json({ success: true });
  })
);
