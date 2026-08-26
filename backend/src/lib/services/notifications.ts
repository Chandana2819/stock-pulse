import { prisma } from "../prisma";

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
 * Writes to the universal notification center. Delivery to push/email/SMS
 * channels is handled by jobs/notify.ts, which reads the user's notification
 * preferences — this function only ever guarantees the in-app record.
 */
export async function pushNotification(input: NotificationInput) {
  return prisma.notification.create({
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
}
