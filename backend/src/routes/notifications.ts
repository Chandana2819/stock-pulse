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
