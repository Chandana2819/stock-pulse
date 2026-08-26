import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/http";
import { env } from "../config/env";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `No route matches ${req.method} ${req.path}`, code: "NOT_FOUND" });
}

/**
 * Single place where errors become responses. Internal details (stack traces,
 * Prisma messages) never reach the client in production — they go to the log.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
  }

  const message = err instanceof Error ? err.message : String(err);

  // Prisma unique-constraint violations are a client error, not a server fault.
  if (message.includes("Unique constraint")) {
    return res.status(409).json({ error: "That record already exists", code: "CONFLICT" });
  }

  console.error(`[error] ${req.method} ${req.path}:`, err);
  return res.status(500).json({
    error: env.isProd ? "Something went wrong. Please try again." : message,
    code: "INTERNAL_ERROR",
  });
}
