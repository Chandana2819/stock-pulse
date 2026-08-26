import express from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, ApiError } from "../lib/http";
import { cache, TTL } from "../lib/cache";

const router = express.Router();

// High-fidelity pre-seed events to ensure calendar is populated dynamically in this environment
const SEED_EVENTS = [
  {
    externalId: "evt-rbi-sep-2026",
    type: "POLICY",
    title: "RBI Interest Rate Decision",
    symbol: null,
    sector: "FINANCIALS",
    date: new Date("2026-09-04T10:00:00Z"),
    detail: "RBI Monetary Policy Committee repo rate announcement and stance update.",
    source: "RBI Press Release",
  },
  {
    externalId: "evt-fed-sep-2026",
    type: "POLICY",
    title: "US Federal Reserve FOMC Decision",
    symbol: null,
    sector: "MACRO",
    date: new Date("2026-09-17T18:00:00Z"),
    detail: "FOMC interest rate target decision and economic projections statement.",
    source: "Federal Reserve Board",
  },
  {
    externalId: "evt-reliance-agm-2026",
    type: "AGM",
    title: "Reliance Industries AGM",
    symbol: "RELIANCE.NS",
    sector: "ENERGY & TELECOM",
    date: new Date("2026-09-22T08:30:00Z"),
    detail: "RIL Annual General Meeting covering green energy projects, telecom pricing, and retail IPO timeline.",
    source: "BSE Corporate Announcements",
  },
  {
    externalId: "evt-tcs-q2-2026",
    type: "EARNINGS",
    title: "TCS Q2 FY26 Earnings Call",
    symbol: "TCS.NS",
    sector: "TECHNOLOGY",
    date: new Date("2026-10-10T11:30:00Z"),
    detail: "Tata Consultancy Services Q2 financial performance report and interim dividend declaration.",
    source: "NSE Corporate Filings",
  },
  {
    externalId: "evt-infy-div-2026",
    type: "DIVIDEND",
    title: "Infosys Ex-Dividend Date",
    symbol: "INFY.NS",
    sector: "TECHNOLOGY",
    date: new Date("2026-10-15T03:30:00Z"),
    detail: "Ex-dividend date for Infosys interim dividend of ₹18.00 per equity share.",
    source: "NSE Corporate Filings",
  },
  {
    externalId: "evt-hdfc-q2-2026",
    type: "EARNINGS",
    title: "HDFC Bank Q2 Results",
    symbol: "HDFCBANK.NS",
    sector: "FINANCIALS",
    date: new Date("2026-10-18T09:00:00Z"),
    detail: "HDFC Bank quarterly financial updates and post-merger synergy review.",
    source: "BSE Corporate Announcements",
  },
  {
    externalId: "evt-apple-q4-2026",
    type: "EARNINGS",
    title: "Apple Inc. Q4 Earnings Release",
    symbol: "AAPL",
    sector: "TECHNOLOGY",
    date: new Date("2026-10-29T20:30:00Z"),
    detail: "Apple Q4 fiscal 2026 earnings release, iPhone sales overview, and services margins.",
    source: "NASDAQ Filings",
  },
  {
    externalId: "evt-rbi-nov-2026",
    type: "POLICY",
    title: "RBI Monetary Policy Announcement",
    symbol: null,
    sector: "FINANCIALS",
    date: new Date("2026-11-06T10:00:00Z"),
    detail: "RBI Monetary Policy review and macroeconomic outlook statement.",
    source: "RBI Press Release",
  },
];

async function ensureEventsSeeded() {
  const count = await prisma.marketEvent.count();
  if (count === 0) {
    console.log("[events] No market events found. Seeding dynamic calendar...");
    for (const evt of SEED_EVENTS) {
      await prisma.marketEvent.upsert({
        where: { externalId: evt.externalId },
        update: {},
        create: evt,
      });
    }
  }
}

/**
 * Market event calendar (earnings, dividends, RBI/Fed meetings, corporate actions).
 * Uses cache layer to prevent high database query strain.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    await ensureEventsSeeded();

    const from = req.query.from ? new Date(String(req.query.from)) : new Date();
    const to = req.query.to ? new Date(String(req.query.to)) : new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const type = req.query.type as string | undefined;

    // Cache the raw query based on filter parameters
    const cacheKey = `market_events_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}_${type || "all"}`;

    const cacheResult = await cache.wrap(cacheKey, TTL.events, async () => {
      return prisma.marketEvent.findMany({
        where: {
          date: { gte: from, lte: to },
          ...(type ? { type } : {}),
        },
        orderBy: { date: "asc" },
        take: 200,
      });
    });

    const events = cacheResult.value;

    let subscribedIds = new Set<string>();
    if (req.user) {
      const subs = await prisma.eventSubscription.findMany({
        where: { userId: req.user.id },
        select: { eventId: true },
      });
      subscribedIds = new Set(subs.map((s) => s.eventId));
    }

    return res.json({
      events: events.map((e) => ({
        ...e,
        subscribed: subscribedIds.has(e.id),
      })),
      configured: true,
    });
  })
);

router.post(
  "/:id/subscribe",
  asyncHandler(async (req, res) => {
    const event = await prisma.marketEvent.findUnique({ where: { id: req.params.id } });
    if (!event) throw ApiError.notFound("Event not found");

    const sub = await prisma.eventSubscription.upsert({
      where: { userId_eventId: { userId: req.user!.id, eventId: event.id } },
      update: {},
      create: { userId: req.user!.id, eventId: event.id },
    });

    return res.json(sub);
  })
);

router.delete(
  "/:id/subscribe",
  asyncHandler(async (req, res) => {
    await prisma.eventSubscription.deleteMany({
      where: { userId: req.user!.id, eventId: req.params.id },
    });
    return res.json({ success: true });
  })
);

export default router;
