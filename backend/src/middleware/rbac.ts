import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../lib/http";

export type Permission =
  | "users"
  | "kyc"
  | "portfolios"
  | "market"
  | "signals"
  | "alerts"
  | "community"
  | "learning"
  | "ipo"
  | "mutual-funds"
  | "notifications"
  | "support"
  | "analytics"
  | "system"
  | "settings";

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  SUPER_ADMIN: [
    "users",
    "kyc",
    "portfolios",
    "market",
    "signals",
    "alerts",
    "community",
    "learning",
    "ipo",
    "mutual-funds",
    "notifications",
    "support",
    "analytics",
    "system",
    "settings",
  ],
  ADMIN: [
    "users",
    "kyc",
    "analytics",
    "support",
    "community",
    "learning",
    "ipo",
    "mutual-funds",
    "notifications",
  ],
  KYC_ADMIN: ["kyc"],
  CONTENT_ADMIN: ["learning", "community", "ipo", "mutual-funds"],
  SUPPORT_ADMIN: ["users", "support"],
};

/** Checks if a user has the specified administrative permission. */
export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized("Authentication required"));
    if (req.user.status !== "ACTIVE") return next(ApiError.forbidden("Account is suspended"));
    
    const role = req.user.role;
    const permissions = ROLE_PERMISSIONS[role];
    
    if (!permissions || !permissions.includes(permission)) {
      return next(ApiError.forbidden(`Access Denied: You do not have permission to access ${permission}`));
    }
    
    next();
  };
}

/** Check if the user is any valid administrator role. */
export function requireAnyAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(ApiError.unauthorized("Authentication required"));
  if (req.user.status !== "ACTIVE") return next(ApiError.forbidden("Account is suspended"));

  const role = req.user.role;
  if (!ROLE_PERMISSIONS[role]) {
    return next(ApiError.forbidden("Access Denied: Administrator role required"));
  }

  next();
}
