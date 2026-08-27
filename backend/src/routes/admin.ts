import express from "express";
import { prisma } from "../lib/prisma";
import { marketDataProvider, newsProvider, fundProvider, ipoProvider, paymentProvider } from "../lib/providers";
import { listBrokers } from "../lib/providers";
import { asyncHandler, ApiError, paginate } from "../lib/http";
import { parse, v } from "../lib/validate";
import { requirePermission, requireAnyAdmin } from "../middleware/rbac";
import { audit } from "../lib/audit";
import { LESSONS, type Lesson } from "../lib/learning";

const router = express.Router();

// Runtime in-memory cache for admin-created learning lessons to avoid local file corruptions.
const dynamicLessons: Lesson[] = [];

// Apply base admin credentials checks for all route entries
router.use(requireAnyAdmin);

// ─── OVERVIEW DASHBOARD ───────────────────────────────────────────────
router.get(
  "/dashboard",
  requirePermission("analytics"),
  asyncHandler(async (req, res) => {
    const totalUsers = await prisma.user.count();
    const activeUsers = await prisma.user.count({ where: { status: "ACTIVE" } });
    const suspendedUsers = await prisma.user.count({ where: { status: "SUSPENDED" } });

    const kycPending = await prisma.user.count({ where: { kycStatus: "PENDING" } });
    const kycVerified = await prisma.user.count({ where: { kycStatus: "VERIFIED" } });
    const kycFailed = await prisma.user.count({ where: { kycStatus: "REJECTED" } });

    const distinctHoldings = await prisma.holding.groupBy({
      by: ["userId"],
    });
    const totalPortfolios = distinctHoldings.length;

    const triggeredAlerts = await prisma.alert.count({ where: { triggerCount: { gt: 0 } } });
    const activeAlerts = await prisma.alert.count({ where: { active: true } });
    const communityPosts = await prisma.communityPost.count();

    let dbOk = true;
    try {
      await prisma.user.count();
    } catch {
      dbOk = false;
    }

    const recentUsers = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, username: true, email: true, role: true, kycStatus: true, status: true, createdAt: true },
    });

    const recentKyc = await prisma.kycRecord.findMany({
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { user: { select: { username: true } } },
    });

    const recentAdminActivity = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { user: { select: { username: true, role: true } } },
    });

    return res.json({
      metrics: {
        totalUsers,
        activeUsers,
        suspendedUsers,
        kycPending,
        kycVerified,
        kycFailed,
        totalPortfolios,
        triggeredAlerts,
        activeAlerts,
        communityPosts,
        systemHealth: dbOk ? "HEALTHY" : "ERROR",
      },
      recentUsers,
      recentKyc: recentKyc.map((k) => ({
        id: k.id,
        username: k.user?.username || "unknown",
        panNumber: k.panNumber ? k.panNumber.substring(0, 5) + "****" + k.panNumber.substring(9) : "N/A",
        documentType: k.documentType,
        amlStatus: k.amlStatus,
        updatedAt: k.updatedAt,
      })),
      recentAdminActivity: recentAdminActivity.map((l) => ({
        id: l.id,
        username: l.user?.username || "system",
        role: l.user?.role || "SYSTEM",
        action: l.action,
        createdAt: l.createdAt,
      })),
    });
  })
);

// ─── USER CONTROLS ────────────────────────────────────────────────────
router.get(
  "/users",
  requirePermission("users"),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    const search = String(req.query.search ?? "").trim().toLowerCase();
    const status = req.query.status as string | undefined;
    const kycStatus = req.query.kycStatus as string | undefined;

    const where: any = {};
    if (search) {
      where.OR = [
        { username: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }
    if (status) {
      where.status = status;
    }
    if (kycStatus) {
      where.kycStatus = kycStatus;
    }

    const total = await prisma.user.count({ where });
    const items = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        kycStatus: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    return res.json({
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  })
);

router.get(
  "/users/:id",
  requirePermission("users"),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        deviceId: true,
        username: true,
        email: true,
        phone: true,
        fullName: true,
        role: true,
        status: true,
        kycStatus: true,
        walletInr: true,
        walletUsd: true,
        createdAt: true,
        lastLoginAt: true,
        profile: true,
        watchlist: true,
        holdings: true,
        transactions: { orderBy: { createdAt: "desc" }, take: 10 },
        goals: true,
        alerts: true,
      },
    });

    if (!user) throw ApiError.notFound("User not found");
    return res.json(user);
  })
);

router.patch(
  "/users/:id/status",
  requirePermission("users"),
  asyncHandler(async (req, res) => {
    const { status } = parse({ status: v.enumOf(["ACTIVE", "SUSPENDED"] as const) }, req.body);
    const targetId = req.params.id;

    if (req.user!.id === targetId) {
      throw ApiError.badRequest("You cannot suspend your own account");
    }

    const oldUser = await prisma.user.findUnique({ where: { id: targetId } });
    if (!oldUser) throw ApiError.notFound("User not found");

    const user = await prisma.user.update({
      where: { id: targetId },
      data: { status },
    });

    await audit(req, "USER_STATUS_CHANGED", {
      entity: "User",
      entityId: targetId,
      meta: { oldStatus: oldUser.status, newStatus: status },
    });

    return res.json({ id: user.id, status: user.status });
  })
);

router.patch(
  "/users/:id/role",
  requirePermission("settings"),
  asyncHandler(async (req, res) => {
    const { role } = parse({ role: v.enumOf(["SUPER_ADMIN", "ADMIN", "KYC_ADMIN", "CONTENT_ADMIN", "SUPPORT_ADMIN", "USER"] as const) }, req.body);
    const targetId = req.params.id;

    if (req.user!.role !== "SUPER_ADMIN") {
      throw ApiError.forbidden("Only SUPER_ADMIN users can modify user roles");
    }
    if (req.user!.id === targetId) {
      throw ApiError.badRequest("You cannot modify your own administrative role");
    }

    const oldUser = await prisma.user.findUnique({ where: { id: targetId } });
    if (!oldUser) throw ApiError.notFound("User not found");

    const user = await prisma.user.update({
      where: { id: targetId },
      data: { role },
    });

    await audit(req, "ADMIN_ROLE_CHANGED", {
      entity: "User",
      entityId: targetId,
      meta: { oldRole: oldUser.role, newRole: role },
    });

    return res.json({ id: user.id, role: user.role });
  })
);

router.post(
  "/users/:id/adjust-wallet",
  requirePermission("users"),
  asyncHandler(async (req, res) => {
    const targetId = req.params.id;
    const { currency, amount, reason } = parse({
      currency: v.enumOf(["INR", "USD"] as const),
      amount: v.number(),
      reason: v.string({ min: 5, max: 500 }),
    }, req.body);

    const user = await prisma.user.findUnique({ where: { id: targetId } });
    if (!user) throw ApiError.notFound("User not found");

    let oldValue = 0;
    let newValue = 0;

    if (currency === "INR") {
      oldValue = user.walletInr;
      newValue = Math.max(0, oldValue + amount);
      await prisma.user.update({
        where: { id: targetId },
        data: { walletInr: newValue },
      });
    } else {
      oldValue = user.walletUsd;
      newValue = Math.max(0, oldValue + amount);
      await prisma.user.update({
        where: { id: targetId },
        data: { walletUsd: newValue },
      });
    }

    await audit(req, "WALLET_BALANCE_ADJUSTED", {
      entity: "User",
      entityId: targetId,
      meta: { currency, oldValue, newValue, adjustment: amount, reason },
    });

    return res.json({ id: targetId, currency, oldValue, newValue });
  })
);

// ─── KYC MANAGEMENT ───────────────────────────────────────────────────
router.get(
  "/kyc",
  requirePermission("kyc"),
  asyncHandler(async (req, res) => {
    const records = await prisma.kycRecord.findMany({
      orderBy: { updatedAt: "desc" },
      include: { user: { select: { username: true, kycStatus: true } } },
    });

    return res.json(
      records.map((r) => ({
        id: r.id,
        userId: r.userId,
        username: r.user?.username || "unknown",
        panNumber: r.panNumber ? r.panNumber.substring(0, 5) + "****" + r.panNumber.substring(9) : "N/A",
        documentType: r.documentType,
        amlStatus: r.amlStatus,
        amlMatchScore: r.amlMatchScore,
        kycStatus: r.user?.kycStatus || "NOT_STARTED",
        updatedAt: r.updatedAt,
      }))
    );
  })
);

router.get(
  "/kyc/:id",
  requirePermission("kyc"),
  asyncHandler(async (req, res) => {
    const record = await prisma.kycRecord.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { username: true, kycStatus: true } } },
    });
    if (!record) throw ApiError.notFound("KYC record not found");

    return res.json({
      ...record,
      panNumber: record.panNumber ? record.panNumber.substring(0, 5) + "****" + record.panNumber.substring(9) : "N/A",
    });
  })
);

router.post(
  "/kyc/:id/review",
  requirePermission("kyc"),
  asyncHandler(async (req, res) => {
    const targetId = req.params.id;
    const { status, reason } = parse({
      status: v.enumOf(["VERIFIED", "REJECTED"] as const),
      reason: v.optional(v.string({ max: 500 })),
    }, req.body);

    const record = await prisma.kycRecord.findUnique({ where: { id: targetId } });
    if (!record) throw ApiError.notFound("KYC record not found");

    const kycStatus = status === "VERIFIED" ? "VERIFIED" : "REJECTED";

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { kycStatus },
      }),
      prisma.kycRecord.update({
        where: { id: targetId },
        data: {
          verifiedAt: status === "VERIFIED" ? new Date() : null,
          rejectedReason: status === "REJECTED" ? (reason || "Rejected by administrator") : null,
        },
      }),
    ]);

    await audit(req, "KYC_STATUS_CHANGED", {
      entity: "KycRecord",
      entityId: targetId,
      meta: { newStatus: kycStatus, reason },
    });

    return res.json({ id: targetId, status: kycStatus });
  })
);

// ─── PORTFOLIO TRACKER ────────────────────────────────────────────────
router.get(
  "/portfolios",
  requirePermission("portfolios"),
  asyncHandler(async (req, res) => {
    const distinctHoldings = await prisma.holding.groupBy({
      by: ["userId"],
    });

    const portfolios = await Promise.all(
      distinctHoldings.map(async (group) => {
        const user = await prisma.user.findUnique({
          where: { id: group.userId },
          select: { username: true, walletInr: true, walletUsd: true },
        });
        const holdings = await prisma.holding.findMany({ where: { userId: group.userId } });
        const totalInvested = holdings.reduce((sum, h) => sum + h.avgPrice * h.quantity, 0);

        return {
          userId: group.userId,
          username: user?.username || "unknown",
          walletInr: user?.walletInr || 0,
          walletUsd: user?.walletUsd || 0,
          holdingsCount: holdings.length,
          totalInvested,
        };
      })
    );

    return res.json(portfolios);
  })
);

// ─── STOCK SIGNALS ────────────────────────────────────────────────────
router.get(
  "/signals",
  requirePermission("signals"),
  asyncHandler(async (req, res) => {
    // Collect count summary of recommendations
    const buyCount = await prisma.stockRecommendation.count({ where: { action: "BUY" } });
    const sellCount = await prisma.stockRecommendation.count({ where: { action: "SELL" } });
    const holdCount = await prisma.stockRecommendation.count({ where: { action: "HOLD" } });

    const recentSignals = await prisma.stockRecommendation.findMany({
      orderBy: { generatedAt: "desc" },
      take: 10,
    });

    return res.json({
      summary: { BUY: buyCount, SELL: sellCount, HOLD: holdCount },
      recentSignals,
    });
  })
);

// ─── ALERTS LOG ───────────────────────────────────────────────────────
router.get(
  "/alerts",
  requirePermission("alerts"),
  asyncHandler(async (req, res) => {
    const alerts = await prisma.alert.findMany({
      orderBy: { updatedAt: "desc" },
      include: { user: { select: { username: true } } },
    });

    return res.json(
      alerts.map((a) => ({
        id: a.id,
        username: a.user?.username || "unknown",
        symbol: a.symbol || "GLOBAL",
        type: a.type,
        active: a.active,
        triggerCount: a.triggerCount,
        lastTriggeredAt: a.lastTriggeredAt,
        createdAt: a.createdAt,
      }))
    );
  })
);

// ─── COMMUNITY MODERATION ─────────────────────────────────────────────
router.get(
  "/community",
  requirePermission("community"),
  asyncHandler(async (req, res) => {
    const posts = await prisma.communityPost.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { username: true } },
        _count: { select: { comments: true } }
      },
    });

    return res.json(
      posts.map((p) => ({
        id: p.id,
        username: p.user?.username || "unknown",
        symbol: p.symbol || "GENERAL",
        title: p.title,
        likes: p.likes,
        commentCount: p._count.comments,
        createdAt: p.createdAt,
      }))
    );
  })
);

router.delete(
  "/community/posts/:id",
  requirePermission("community"),
  asyncHandler(async (req, res) => {
    const targetId = req.params.id;
    const post = await prisma.communityPost.findUnique({ where: { id: targetId } });
    if (!post) throw ApiError.notFound("Post not found");

    await prisma.communityPost.delete({ where: { id: targetId } });

    await audit(req, "COMMUNITY_POST_MODERATED", {
      entity: "CommunityPost",
      entityId: targetId,
      meta: { authorId: post.userId, title: post.title },
    });

    return res.json({ success: true, message: "Post moderated successfully" });
  })
);

// ─── LEARNING PUBLISHER ───────────────────────────────────────────────
router.get(
  "/learning",
  requirePermission("learning"),
  asyncHandler(async (req, res) => {
    const merged = [...LESSONS, ...dynamicLessons];
    return res.json(merged);
  })
);

router.post(
  "/learning",
  requirePermission("learning"),
  asyncHandler(async (req, res) => {
    const body = parse({
      id: v.string({ min: 3, max: 100 }),
      title: v.string({ min: 3, max: 150 }),
      level: v.enumOf(["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const),
      track: v.string({ min: 2, max: 50 }),
      summary: v.string({ min: 5, max: 300 }),
      body: v.stringArray({ max: 20 }),
      example: v.optional(v.string()),
      quiz: v.optional((val) => val as any), // array of questions verified dynamically
    }, req.body);

    const checkExists = [...LESSONS, ...dynamicLessons].some((l) => l.id === body.id);
    if (checkExists) throw ApiError.badRequest("Lesson with this ID already exists");

    const newLesson: Lesson = {
      id: body.id,
      title: body.title,
      level: body.level,
      track: body.track,
      summary: body.summary,
      body: body.body,
      example: body.example,
      quiz: Array.isArray(body.quiz) ? body.quiz : [],
      related: [],
    };

    dynamicLessons.push(newLesson);

    await audit(req, "CONTENT_CREATED", {
      entity: "Lesson",
      entityId: body.id,
      meta: { title: body.title },
    });

    return res.json(newLesson);
  })
);

// ─── IPO LIST ─────────────────────────────────────────────────────────
router.get(
  "/ipo",
  requirePermission("ipo"),
  asyncHandler(async (req, res) => {
    const ipos = await ipoProvider.list();
    return res.json(ipos);
  })
);

// ─── MUTUAL FUNDS ─────────────────────────────────────────────────────
router.get(
  "/mutual-funds",
  requirePermission("mutual-funds"),
  asyncHandler(async (req, res) => {
    const counts = await prisma.fundWatchItem.count();
    return res.json({
      provider: fundProvider.id,
      watchlistsTracked: counts,
      status: fundProvider.id ? "ONLINE" : "OFFLINE",
    });
  })
);

// ─── NOTIFICATION BROADCAST ───────────────────────────────────────────
router.post(
  "/notifications",
  requirePermission("notifications"),
  asyncHandler(async (req, res) => {
    const { title, body, type, userId } = parse({
      title: v.string({ min: 1, max: 150 }),
      body: v.string({ min: 1, max: 1000 }),
      type: v.enumOf(["SECURITY", "MARKET", "ALERT", "SYSTEM"] as const),
      userId: v.optional(v.string()), // Target user ID or broad broadcast if missing
    }, req.body);

    if (userId) {
      await prisma.notification.create({
        data: { userId, title, body, category: type },
      });
    } else {
      // Broadcast to all active users
      const users = await prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
      await prisma.notification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          title,
          body,
          category: type,
        })),
      });
    }

    await audit(req, "NOTIFICATION_SENT", {
      meta: { type, title, targeted: !!userId },
    });

    return res.json({ success: true, message: "Notifications broadcasted successfully" });
  })
);

// ─── SUPPORT TICKETS ──────────────────────────────────────────────────
router.get(
  "/support",
  requirePermission("support"),
  asyncHandler(async (req, res) => {
    const tickets = await prisma.supportTicket.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        user: { select: { username: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    return res.json(tickets);
  })
);

router.patch(
  "/support/:id",
  requirePermission("support"),
  asyncHandler(async (req, res) => {
    const targetId = req.params.id;
    const { message, status } = parse({
      message: v.optional(v.string({ min: 1, max: 2000 })),
      status: v.enumOf(["OPEN", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED"] as const),
    }, req.body);

    const ticket = await prisma.supportTicket.findUnique({ where: { id: targetId } });
    if (!ticket) throw ApiError.notFound("Support ticket not found");

    if (message) {
      await prisma.ticketMessage.create({
        data: { ticketId: targetId, author: "SUPPORT", body: message },
      });
    }

    await prisma.supportTicket.update({
      where: { id: targetId },
      data: { status, updatedAt: new Date() },
    });

    await audit(req, "SUPPORT_TICKET_UPDATED", {
      entity: "SupportTicket",
      entityId: targetId,
      meta: { newStatus: status },
    });

    return res.json({ success: true });
  })
);

// ─── ANALYTICS ────────────────────────────────────────────────────────
router.get(
  "/analytics",
  requirePermission("analytics"),
  asyncHandler(async (req, res) => {
    const totalUsers = await prisma.user.count();
    const verifiedKyc = await prisma.user.count({ where: { kycStatus: "VERIFIED" } });
    const pendingKyc = await prisma.user.count({ where: { kycStatus: "PENDING" } });

    // Aggregations over users created per day for growth charts
    const users = await prisma.user.findMany({
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const dailyGrowth: Record<string, number> = {};
    users.forEach((u) => {
      const date = u.createdAt.toISOString().split("T")[0];
      dailyGrowth[date] = (dailyGrowth[date] || 0) + 1;
    });

    return res.json({
      overall: { totalUsers, verifiedKyc, pendingKyc },
      dailyGrowth: Object.entries(dailyGrowth).map(([date, count]) => ({ date, count })),
    });
  })
);

// ─── SYSTEM STATUS & HEALTH ───────────────────────────────────────────
router.get(
  "/system/health",
  requirePermission("system"),
  asyncHandler(async (req, res) => {
    let dbStatus = "HEALTHY";
    try {
      await prisma.user.count();
    } catch {
      dbStatus = "UNAVAILABLE";
    }

    return res.json({
      database: dbStatus,
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

// ─── AUDIT TRAILS ─────────────────────────────────────────────────────
router.get(
  "/audit-logs",
  requirePermission("settings"),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));

    const total = await prisma.auditLog.count();
    const items = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { username: true, role: true } } },
    });

    return res.json({
      items: items.map((l) => ({
        id: l.id,
        username: l.user?.username || "system",
        role: l.user?.role || "SYSTEM",
        action: l.action,
        entity: l.entity,
        entityId: l.entityId,
        ip: l.ip,
        userAgent: l.userAgent,
        meta: l.meta,
        createdAt: l.createdAt,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  })
);

export default router;
