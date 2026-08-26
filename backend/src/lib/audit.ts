import type { Request } from "express";
import { prisma } from "./prisma";

/**
 * Append-only audit trail for security- and money-relevant actions.
 * Never throws: a failed audit write must not break the user's request, but it
 * must be loud in the log.
 */
export async function audit(
  req: Request | null,
  action: string,
  opts: { userId?: string | null; entity?: string; entityId?: string; meta?: Record<string, unknown> } = {}
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: opts.userId ?? req?.user?.id ?? null,
        action,
        entity: opts.entity,
        entityId: opts.entityId,
        ip: req?.ip ?? null,
        userAgent: typeof req?.headers["user-agent"] === "string" ? req.headers["user-agent"].slice(0, 255) : null,
        meta: opts.meta ? JSON.stringify(opts.meta) : null,
      },
    });
  } catch (err) {
    console.error("[audit] failed to record", action, err);
  }
}
