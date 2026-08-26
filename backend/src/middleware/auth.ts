import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { hashToken } from "../lib/auth";
import { ApiError } from "../lib/http";

export type AuthUser = {
  id: string;
  deviceId: string;
  username: string | null;
  email: string | null;
  role: string;
  status: string;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionId?: string;
    }
  }
}

/**
 * Resolves the caller.
 *
 * Two accepted credentials, in priority order:
 *  1. `Authorization: Bearer <token>` — a real server-issued session. Preferred.
 *  2. `x-device-id` — the original anonymous-device scheme this app shipped
 *     with. Kept so existing installs keep working; it identifies a device, not
 *     a verified person, so it is refused on anything sensitive (see
 *     `requireRealSession`).
 */
async function resolveUser(req: Request): Promise<{ user: AuthUser; sessionId?: string } | null> {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (session && !session.revokedAt && session.expiresAt >= new Date()) {
      // Touch at most once a minute so a busy dashboard does not write on every request.
      if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
        await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
      }
      const u = session.user;
      return {
        user: { id: u.id, deviceId: u.deviceId, username: u.username, email: u.email, role: u.role, status: u.status },
        sessionId: session.id,
      };
    }
    // Invalid/expired token: fall through to the device-id credential rather
    // than hard-failing the request — e.g. a dev secret rotation invalidates
    // the token hash without revoking the underlying account.
  }

  const deviceId = req.headers["x-device-id"];
  if (typeof deviceId === "string" && deviceId.trim()) {
    const id = deviceId.trim().slice(0, 128);
    let u = await prisma.user.findUnique({ where: { deviceId: id } });
    if (!u) u = await prisma.user.create({ data: { deviceId: id } });
    return {
      user: { id: u.id, deviceId: u.deviceId, username: u.username, email: u.email, role: u.role, status: u.status },
    };
  }

  return null;
}

/** Populates req.user when credentials are present, but never rejects. */
export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const resolved = await resolveUser(req);
    if (resolved) {
      req.user = resolved.user;
      req.sessionId = resolved.sessionId;
    }
  } catch {
    // An unreadable credential is simply an anonymous request.
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(ApiError.unauthorized("Sign in to continue"));
  if (req.user.status !== "ACTIVE") return next(ApiError.forbidden("This account is suspended"));
  next();
}

/** For endpoints that must not be reachable with only an anonymous device id. */
export function requireRealSession(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(ApiError.unauthorized("Sign in to continue"));
  if (!req.sessionId) return next(ApiError.forbidden("This action requires a signed-in account, not a device session"));
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role !== "ADMIN") return next(ApiError.forbidden("Administrator access required"));
  next();
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}
