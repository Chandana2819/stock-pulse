// Alert evaluation. A background job (jobs/alertRunner.ts) calls
// `evaluateAlertsForUser` periodically; routes can also call it synchronously
// after a price-moving action for immediate feedback.

import { prisma } from "../prisma";
import { marketDataProvider } from "../providers";
import { pctChange, computeIndicators } from "../indicators";
import { pushNotification } from "./notifications";
import { resolveIndexSymbol } from "../symbols";

const COOLDOWN_MS = 30 * 60 * 1000; // don't re-fire the same alert more than once per 30 minutes

// A symbol-less alert is a market-wide one — the UI creates these under a
// "MARKET" label (see alerts/page.tsx: `a.symbol ?? "MARKET"`), but nothing
// here ever evaluated them: the old code only ever checked `if (alert.symbol)`,
// so a market alert was accepted on creation and then silently never fired,
// forever, with no error surfaced anywhere. NIFTY 50 is the natural proxy for
// "the market" — the same index the dashboard's own Market Risk panel uses.
const MARKET_PROXY_SYMBOL = resolveIndexSymbol("NIFTY 50").providerSymbol;

export async function evaluateAlertsForUser(userId: string) {
  const alerts = await prisma.alert.findMany({ where: { userId, active: true } });
  if (alerts.length === 0) return { checked: 0, triggered: 0 };

  const targetSymbol = (alert: (typeof alerts)[number]) => alert.symbol ?? MARKET_PROXY_SYMBOL;
  const symbols = [...new Set(alerts.map(targetSymbol))];
  const quotes = symbols.length ? await marketDataProvider.getQuotes(symbols) : {};

  let triggered = 0;
  for (const alert of alerts) {
    if (alert.lastTriggeredAt && Date.now() - alert.lastTriggeredAt.getTime() < COOLDOWN_MS) continue;

    let fireMessage: string | null = null;
    let value: number | null = null;

    const symbol = targetSymbol(alert);
    const label = alert.symbol ?? "The market (NIFTY 50)";
    const q = quotes[symbol];
    if (!q) continue;
    const changePct = pctChange(q.price, q.prevClose);

    if (alert.type === "PRICE_ABOVE" && alert.threshold != null && q.price >= alert.threshold) {
      fireMessage = `${label} crossed above ${alert.threshold}`;
      value = q.price;
    } else if (alert.type === "PRICE_BELOW" && alert.threshold != null && q.price <= alert.threshold) {
      fireMessage = `${label} crossed below ${alert.threshold}`;
      value = q.price;
    } else if (alert.type === "PCT_MOVE" && alert.threshold != null && changePct != null && Math.abs(changePct) >= alert.threshold) {
      fireMessage = `${label} moved ${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}% today`;
      value = changePct;
    } else if (alert.type === "VOLUME_SPIKE" && alert.threshold != null && q.volume != null && q.avgVolume) {
      const ratio = q.volume / q.avgVolume;
      if (ratio >= alert.threshold) {
        fireMessage = `${label} volume is ${ratio.toFixed(1)}x its average`;
        value = ratio;
      }
    } else if ((alert.type === "RSI_ABOVE" || alert.type === "RSI_BELOW") && alert.threshold != null) {
      const candles = await marketDataProvider.getCandles(symbol, "3M");
      const rsi = candles.length > 20 ? computeIndicators(candles).rsi14 : null;
      if (rsi != null) {
        if (alert.type === "RSI_ABOVE" && rsi >= alert.threshold) {
          fireMessage = `${label} RSI(14) is ${rsi.toFixed(0)}, above your ${alert.threshold} threshold`;
          value = rsi;
        } else if (alert.type === "RSI_BELOW" && rsi <= alert.threshold) {
          fireMessage = `${label} RSI(14) is ${rsi.toFixed(0)}, below your ${alert.threshold} threshold`;
          value = rsi;
        }
      }
    }

    if (fireMessage) {
      triggered++;
      await prisma.$transaction([
        prisma.alertTrigger.create({ data: { alertId: alert.id, value, message: fireMessage } }),
        prisma.alert.update({ where: { id: alert.id }, data: { lastTriggeredAt: new Date(), triggerCount: { increment: 1 } } }),
      ]);
      await pushNotification({
        userId,
        category: "MARKET",
        priority: "HIGH",
        title: `Alert: ${alert.symbol ?? "Market"}`,
        body: fireMessage,
        link: alert.symbol ? `/stock/${alert.symbol}` : "/",
      });
    }
  }

  return { checked: alerts.length, triggered };
}

export async function evaluateAllActiveUsers(limit = 200) {
  const userIds = await prisma.alert.findMany({
    where: { active: true },
    distinct: ["userId"],
    select: { userId: true },
    take: limit,
  });
  let totalTriggered = 0;
  for (const { userId } of userIds) {
    try {
      const result = await evaluateAlertsForUser(userId);
      totalTriggered += result.triggered;
    } catch (err) {
      console.error(`[alerts] failed evaluating for user ${userId}:`, err);
    }
  }
  return { users: userIds.length, triggered: totalTriggered };
}
