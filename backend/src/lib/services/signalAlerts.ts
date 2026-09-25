// Notifies a user when one of their portfolio holdings hits the two
// highest-conviction tiers of the 7-pillar decision engine (STRONG BUY /
// STRONG SELL). Runs on its own, longer interval (see scheduler.ts) since it
// re-runs the full live per-symbol analysis, unlike the cheap price-only
// alerts in alerts.ts.

import { prisma } from "../prisma";
import { pushNotification } from "./notifications";
import { buildStockAnalysis } from "./stockAnalysis";
import type { SignalAction } from "../engine/decision";

const NOTIFIABLE_SIGNALS = new Set<SignalAction>(["STRONG BUY", "BUY", "SELL", "STRONG SELL"]);
const BATCH_SIZE = 6;
const CATEGORY = "PORTFOLIO";

async function evaluateHolding(userId: string, holding: { stock: string; exchange: string }) {
  let symbol = holding.stock.toUpperCase().trim();
  if (holding.exchange === "NSE" && !symbol.endsWith(".NS")) {
    symbol = `${symbol}.NS`;
  } else if (holding.exchange === "BSE" && !symbol.endsWith(".BO")) {
    symbol = `${symbol}.BO`;
  }

  const analysis = await buildStockAnalysis(symbol).catch(() => null);
  if (!analysis || !analysis.found || analysis.decision.validationFailed) return false;

  const signal = analysis.decision.signal;
  if (!NOTIFIABLE_SIGNALS.has(signal)) return false;

  const link = `/stock/${symbol}`;

  // Only notify on a genuinely new call — skip if the most recent
  // portfolio-signal notification for this exact symbol already reported the
  // same signal, so a holding sitting at STRONG BUY doesn't re-notify every
  // interval tick.
  const last = await prisma.notification.findFirst({
    where: { userId, category: CATEGORY, link },
    orderBy: { createdAt: "desc" },
  });
  const lastSignal = last?.meta ? (JSON.parse(last.meta).signal as string | undefined) : undefined;
  if (lastSignal === signal) return false;

  const displaySymbol = analysis.resolved.displaySymbol;
  const score = analysis.decision.scores.final;

  const d = analysis.decision;
  let title = "";
  let body = "";
  let priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL" = "HIGH";

  if (signal === "STRONG BUY" || signal === "BUY") {
    title = `🟢 ${signal}: ${displaySymbol}`;
    const entry = d.entryZone ? ` Entry zone: ₹${d.entryZone.min}–₹${d.entryZone.max}.` : "";
    const sl    = d.stopLoss   ? ` Stop-loss: ₹${d.stopLoss}.`                           : "";
    const tgt   = d.targetRange ? ` Target: ₹${d.targetRange.min}–₹${d.targetRange.max}.` : "";
    body = `Score ${score}/100.${entry}${sl}${tgt} ${d.synthesis ?? ""}`.trim();
    priority = signal === "STRONG BUY" ? "HIGH" : "NORMAL";
  } else {
    title = `🔴 ${signal}: ${displaySymbol}`;
    body = `Score ${score}/100 — ${d.synthesis ?? "Consider reviewing this position."}`;
    priority = signal === "STRONG SELL" ? "CRITICAL" : "HIGH";
  }

  await pushNotification({
    userId,
    category: CATEGORY,
    priority,
    title,
    body,
    link,
    meta: { symbol, signal, score },
  });
  return true;
}

export async function evaluateSignalAlertsForUser(userId: string) {
  // quantity > 0 — never send exit/sell alerts for a stock already sold out.
  const holdings = await prisma.holding.findMany({ where: { userId, quantity: { gt: 0 } } });
  if (holdings.length === 0) return { checked: 0, notified: 0 };

  let notified = 0;
  for (let i = 0; i < holdings.length; i += BATCH_SIZE) {
    const batch = holdings.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((h) => evaluateHolding(userId, h)));
    notified += results.filter(Boolean).length;
  }
  return { checked: holdings.length, notified };
}

export async function evaluateSignalAlertsForAllUsers(limit = 200) {
  const userIds = await prisma.holding.findMany({
    distinct: ["userId"],
    select: { userId: true },
    take: limit,
  });

  let totalNotified = 0;
  for (const { userId } of userIds) {
    try {
      const result = await evaluateSignalAlertsForUser(userId);
      totalNotified += result.notified;
    } catch (err) {
      console.error(`[signal-alerts] failed evaluating for user ${userId}:`, err);
    }
  }
  return { users: userIds.length, notified: totalNotified };
}
