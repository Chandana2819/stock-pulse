// Alert evaluation. A background job (jobs/alertRunner.ts) calls
// `evaluateAlertsForUser` periodically; routes can also call it synchronously
// after a price-moving action for immediate feedback.

import { prisma } from "../prisma";
import { marketDataProvider } from "../providers";
import { pctChange, computeIndicators } from "../indicators";
import { pushNotification } from "./notifications";

const COOLDOWN_MS = 30 * 60 * 1000; // don't re-fire the same alert more than once per 30 minutes

export async function evaluateAlertsForUser(userId: string) {
  const alerts = await prisma.alert.findMany({ where: { userId, active: true } });
  if (alerts.length === 0) return { checked: 0, triggered: 0 };

  const symbolAlerts = alerts.filter((a) => a.symbol);
  const symbols = [...new Set(symbolAlerts.map((a) => a.symbol!))];
  const quotes = symbols.length ? await marketDataProvider.getQuotes(symbols) : {};

  let triggered = 0;
  for (const alert of alerts) {
    if (alert.lastTriggeredAt && Date.now() - alert.lastTriggeredAt.getTime() < COOLDOWN_MS) continue;

    let fireMessage: string | null = null;
    let value: number | null = null;

    if (alert.symbol) {
      const q = quotes[alert.symbol];
      if (!q) continue;
      const changePct = pctChange(q.price, q.prevClose);

      if (alert.type === "PRICE_ABOVE" && alert.threshold != null && q.price >= alert.threshold) {
        fireMessage = `${alert.symbol} crossed above ${alert.threshold}`;
        value = q.price;
      } else if (alert.type === "PRICE_BELOW" && alert.threshold != null && q.price <= alert.threshold) {
        fireMessage = `${alert.symbol} crossed below ${alert.threshold}`;
        value = q.price;
      } else if (alert.type === "PCT_MOVE" && alert.threshold != null && changePct != null && Math.abs(changePct) >= alert.threshold) {
        fireMessage = `${alert.symbol} moved ${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}% today`;
        value = changePct;
      } else if (alert.type === "VOLUME_SPIKE" && alert.threshold != null && q.volume != null && q.avgVolume) {
        const ratio = q.volume / q.avgVolume;
        if (ratio >= alert.threshold) {
          fireMessage = `${alert.symbol} volume is ${ratio.toFixed(1)}x its average`;
          value = ratio;
        }
      } else if ((alert.type === "RSI_ABOVE" || alert.type === "RSI_BELOW") && alert.threshold != null) {
        const candles = await marketDataProvider.getCandles(alert.symbol, "3M");
        const rsi = candles.length > 20 ? computeIndicators(candles).rsi14 : null;
        if (rsi != null) {
          if (alert.type === "RSI_ABOVE" && rsi >= alert.threshold) {
            fireMessage = `${alert.symbol} RSI(14) is ${rsi.toFixed(0)}, above your ${alert.threshold} threshold`;
            value = rsi;
          } else if (alert.type === "RSI_BELOW" && rsi <= alert.threshold) {
            fireMessage = `${alert.symbol} RSI(14) is ${rsi.toFixed(0)}, below your ${alert.threshold} threshold`;
            value = rsi;
          }
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
