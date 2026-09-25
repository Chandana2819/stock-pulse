// Portfolio Crash Monitor
//
// Runs every 5 minutes during NSE market hours (9:15–15:30 IST) — tightened
// from 15 min so a fast move is caught within one tick instead of possibly
// sitting unnoticed for up to a quarter hour.
//
// For each user with active holdings it:
//   1. Fetches live prices from the market data provider
//   2. Flags any stock that has moved ≥ its own volatility-adjusted threshold
//      today (see dynamicThresholdPct below) — not one fixed % for every
//      stock. A stock that normally swings 4% a day needs a bigger move to
//      count as "notable" than one that normally barely moves at all.
//   3. Fetches real Google News headlines to explain *why*
//   4. Decides: SELL NOW (price ≤ stop-loss) vs WATCH (still above stop-loss)
//   5. Pushes an in-app notification with the reason + recommended action
//
// Market crash: when NIFTY 50 itself is down ≥ 2% it sends a single
// market-wide alert to every user (with a 2-hour cooldown).

import { prisma } from "../prisma";
import { marketDataProvider, newsProvider } from "../providers";
import { pushNotification } from "./notifications";
import { pctChange, realisedVolatility } from "../indicators";
import { resolveIndexSymbol } from "../symbols";
import { scanNewsForNegativeAnnouncement } from "../providers/nseProvider";

const MARKET_PCT   = 2;   // NIFTY drop threshold % — market-wide, stays fixed
const COOLDOWN_MS  = 2 * 60 * 60 * 1000; // 2 hours between same-stock alerts
const NIFTY_SYMBOL = resolveIndexSymbol("NIFTY 50").providerSymbol;

// Per-stock threshold floor/ceiling: never alert on sub-2% noise, never
// require more than a 6% move even for a genuinely volatile stock — keeps
// the range sane at both ends of the volatility spectrum.
const THRESHOLD_FLOOR = 2;
const THRESHOLD_CEILING = 6;
const THRESHOLD_VOL_MULTIPLIER = 1.5; // "notable" = 1.5x the stock's typical daily move

/**
 * A stock-specific "this move is actually notable" threshold, derived from
 * its own realised volatility instead of one fixed % for every symbol.
 * Falls back to the flat 3% BullHawk used before this if candles aren't
 * available (new listing, provider hiccup, etc.) — same old behavior, just
 * as the fallback rather than the default.
 */
async function dynamicThresholdPct(symbol: string): Promise<number> {
  try {
    const candles = await marketDataProvider.getCandles(symbol, "1M");
    const closes = candles.map((c) => c.close).filter((c) => Number.isFinite(c));
    const annualisedVolPct = realisedVolatility(closes, 20);
    if (annualisedVolPct == null) return 3;
    const dailyVolPct = annualisedVolPct / Math.sqrt(252);
    const threshold = dailyVolPct * THRESHOLD_VOL_MULTIPLIER;
    return Math.min(THRESHOLD_CEILING, Math.max(THRESHOLD_FLOOR, threshold));
  } catch {
    return 3;
  }
}

/** True between 9:10 and 15:40 IST on weekdays */
function isMarketHours(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay(); // 0 Sun, 6 Sat
  if (day === 0 || day === 6) return false;
  const h = ist.getHours();
  const m = ist.getMinutes();
  const mins = h * 60 + m;
  return mins >= 9 * 60 + 10 && mins <= 15 * 60 + 40;
}

/** Fetch the most relevant real headline for a stock (max 1 call, cached). */
async function getTopHeadline(displaySymbol: string): Promise<string | null> {
  try {
    const news = await newsProvider.getNews(`${displaySymbol} NSE India stock`, 5);
    if (!news.length) return null;
    // Prefer negative/crash headlines for crash alerts
    const check = scanNewsForNegativeAnnouncement(
      news.map((n) => ({ title: n.title, sentiment: "NEUTRAL" as const, sentimentScore: 0 }))
    );
    if (check.flagged && check.matchedKeyword) {
      const matched = news.find((n) => n.title.toLowerCase().includes(check.matchedKeyword!.toLowerCase()));
      if (matched) return matched.title;
    }
    return news[0]?.title ?? null;
  } catch {
    return null;
  }
}

/** Check if we already sent this category of alert for this symbol recently. */
async function recentlySent(userId: string, symbol: string, type: "CRASH" | "SURGE" | "MARKET"): Promise<boolean> {
  const key = `${type}:${symbol}`;
  const last = await prisma.notification.findFirst({
    where: {
      userId,
      category: "PORTFOLIO",
      link: key,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!last) return false;
  return Date.now() - last.createdAt.getTime() < COOLDOWN_MS;
}

async function monitorUser(userId: string) {
  // quantity > 0 — a sold-out 0-share row is not a position to monitor.
  const holdings = await prisma.holding.findMany({ where: { userId, quantity: { gt: 0 } } });
  if (!holdings.length) return;

  // Build provider symbols
  const symbolMap: Record<string, { stock: string; exchange: string }> = {};
  for (const h of holdings) {
    let sym = h.stock.toUpperCase().trim();
    if (h.exchange === "NSE" && !sym.endsWith(".NS")) sym = `${sym}.NS`;
    else if (h.exchange === "BSE" && !sym.endsWith(".BO")) sym = `${sym}.BO`;
    symbolMap[sym] = h;
  }

  const symbols = Object.keys(symbolMap);
  const quotes = await marketDataProvider.getQuotes(symbols).catch(() => ({} as Record<string, any>));

  for (const [sym, holding] of Object.entries(symbolMap)) {
    const q = quotes[sym];
    if (!q?.price || !q?.prevClose) continue;

    const chg = pctChange(q.price, q.prevClose);
    if (chg == null) continue;

    const displaySym = holding.stock.toUpperCase();

    // Stop-loss breach is action-critical regardless of how "normal" a move
    // this is for the stock — check it independently of the volatility
    // threshold below, so a low-volatility stock can't have a real stop-loss
    // breach silently wait for a bigger % move to qualify as "notable".
    const rec = await prisma.stockRecommendation.findFirst({
      where: { symbol: sym },
      orderBy: { generatedAt: "desc" },
    });
    const stopLoss = rec?.stopLoss ?? null;
    const belowStopLoss = stopLoss != null && q.price <= stopLoss;

    const threshold = await dynamicThresholdPct(sym);

    // ── CRASH: stop-loss breached, OR down ≥ this stock's own threshold ───
    if (belowStopLoss || chg <= -threshold) {
      if (await recentlySent(userId, sym, "CRASH")) continue;

      const headline = await getTopHeadline(displaySym);
      const reasonPart = headline
        ? `Possible reason: "${headline}"`
        : "No specific news found — could be sector selling or broader market pressure.";

      const action = belowStopLoss
        ? `⚠️ Price (₹${q.price.toFixed(2)}) is AT or BELOW your stop-loss of ₹${stopLoss!.toFixed(2)}. Consider SELLING to limit further loss.`
        : stopLoss
        ? `Price (₹${q.price.toFixed(2)}) is still above your stop-loss of ₹${stopLoss.toFixed(2)}. WATCH closely — sell if it breaks ₹${stopLoss.toFixed(2)}.`
        : `Current price: ₹${q.price.toFixed(2)}. Check your stop-loss level.`;

      await pushNotification({
        userId,
        category: "PORTFOLIO",
        priority: belowStopLoss ? "CRITICAL" : "HIGH",
        title: `📉 ${displaySym} is down ${Math.abs(chg).toFixed(1)}% today`,
        body: `${reasonPart}\n\n${action}`,
        link: `CRASH:${sym}`,
        meta: { symbol: sym, changePct: chg, headline, belowStopLoss, thresholdUsedPct: Number(threshold.toFixed(2)) },
      });
    }

    // ── SURGE: stock up ≥ this stock's own threshold (might be a BUY opportunity to add more) ─
    if (chg >= threshold) {
      if (await recentlySent(userId, sym, "SURGE")) continue;

      // Reuses the `rec` already fetched above for the stop-loss check —
      // same latest recommendation row, no need to query twice.
      const signal = rec?.action ?? "—";

      // Only notify surges when signal is positive
      if (!signal.includes("BUY") && signal !== "HOLD") continue;

      const headline = await getTopHeadline(displaySym);
      const reasonPart = headline ? `News: "${headline}"` : "Strong buying momentum detected.";

      await pushNotification({
        userId,
        category: "PORTFOLIO",
        priority: "NORMAL",
        title: `📈 ${displaySym} is up ${chg.toFixed(1)}% today`,
        body: `${reasonPart}\n\nAI Signal: ${signal} (score ${rec?.score ?? "—"}/100). You may consider adding to your position at current levels if within your plan.`,
        link: `SURGE:${sym}`,
        meta: { symbol: sym, changePct: chg, headline },
      });
    }
  }
}

/** Market-wide crash: NIFTY down ≥ 2% → alert all users (1 per user, 2-hr cooldown). */
async function checkMarketCrash() {
  try {
    const nifty = await marketDataProvider.getQuote(NIFTY_SYMBOL).catch(() => null);
    if (!nifty?.price || !nifty?.prevClose) return;
    const chg = pctChange(nifty.price, nifty.prevClose);
    if (chg == null || chg > -MARKET_PCT) return;

    const userIds = await prisma.holding.findMany({
      distinct: ["userId"],
      select: { userId: true },
      take: 500,
    });

    for (const { userId } of userIds) {
      if (await recentlySent(userId, "NIFTY", "MARKET")) continue;
      await pushNotification({
        userId,
        category: "MARKET",
        priority: "HIGH",
        title: `🔴 Market Alert: NIFTY is down ${Math.abs(chg).toFixed(1)}% today`,
        body: `The broad market is falling. Review all your holdings — check which ones are below their stop-loss and consider reducing exposure in weaker stocks. Do not panic-sell quality holdings without checking fundamentals first.`,
        link: "MARKET:NIFTY",
        meta: { symbol: "NIFTY 50", changePct: chg },
      });
    }
  } catch (err) {
    console.error("[crash-monitor] market crash check failed:", err);
  }
}

export async function runPortfolioCrashMonitor() {
  if (!isMarketHours()) return { skipped: true, users: 0 };

  await checkMarketCrash();

  const userIds = await prisma.holding.findMany({
    distinct: ["userId"],
    select: { userId: true },
    take: 200,
  });

  let users = 0;
  for (const { userId } of userIds) {
    try {
      await monitorUser(userId);
      users++;
    } catch (err) {
      console.error(`[crash-monitor] failed for user ${userId}:`, err);
    }
  }
  return { skipped: false, users };
}
