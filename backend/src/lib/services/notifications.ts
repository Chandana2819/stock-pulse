import webpush from "web-push";
import { prisma } from "../prisma";
import { env } from "../../config/env";

// Initialise web-push with VAPID credentials (no-ops if keys are empty)
if (env.vapidPublicKey && env.vapidPrivateKey) {
  webpush.setVapidDetails(
    env.vapidEmail || "mailto:support@bullhawk.in",
    env.vapidPublicKey,
    env.vapidPrivateKey
  );
}

export type NotificationInput = {
  userId: string;
  category: "PORTFOLIO" | "MARKET" | "STOCK" | "NEWS" | "IPO" | "FUNDS" | "PAYMENT" | "ORDER" | "SECURITY" | "GOAL" | "SYSTEM";
  priority?: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  title: string;
  body: string;
  link?: string;
  meta?: Record<string, unknown>;
};

/**
 * Writes to the universal notification center AND dispatches a real browser
 * push notification to every registered device for this user.
 */
export async function pushNotification(input: NotificationInput) {
  // 1. Persist in-app notification
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      category: input.category,
      priority: input.priority ?? "NORMAL",
      title: input.title,
      body: input.body,
      link: input.link,
      meta: input.meta ? JSON.stringify(input.meta) : null,
    },
  });

  // 2. Send real web push (best-effort — never throw)
  if (env.vapidPublicKey && env.vapidPrivateKey) {
    try {
      const subs = await prisma.pushSubscription.findMany({ where: { userId: input.userId } });
      const payload = JSON.stringify({
        title: input.title,
        body: input.body,
        link: input.link ?? "/",
        priority: input.priority ?? "NORMAL",
        tag: `bullhawk-${notification.id}`,
      });

      const results = await Promise.allSettled(
        subs.map((sub) =>
          webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { urgency: input.priority === "CRITICAL" ? "high" : input.priority === "HIGH" ? "high" : "normal" }
          )
        )
      );

      // Remove expired/gone subscriptions (410 Gone)
      const goneEndpoints = subs
        .filter((_, i) => {
          const r = results[i];
          return r.status === "rejected" && (r as any).reason?.statusCode === 410;
        })
        .map((s) => s.endpoint);

      if (goneEndpoints.length) {
        await prisma.pushSubscription.deleteMany({
          where: { endpoint: { in: goneEndpoints } },
        });
      }
    } catch (err) {
      console.error("[push] Web push dispatch error:", err);
    }
  }

  return notification;
}
