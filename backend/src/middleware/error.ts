import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/http";
import { env } from "../config/env";
import { logger } from "../lib/logger";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `No route matches ${req.method} ${req.path}`, code: "NOT_FOUND" });
}

/**
 * Single place where errors become responses. Internal details (stack traces,
 * Prisma messages) never reach the client in production — they go to the log,
 * keyed by requestId so a user-reported error can be grepped straight to the
 * matching server-side log line without exposing internals to the client.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    if (err.status >= 500) {
      logger.error(`${req.method} ${req.path}`, err, { requestId: req.id, code: err.code });
    }
    return res.status(err.status).json({ error: err.message, code: err.code, details: err.details, requestId: req.id });
  }

  const message = err instanceof Error ? err.message : String(err);

  // Prisma unique-constraint violations are a client error, not a server fault.
  if (message.includes("Unique constraint")) {
    return res.status(409).json({ error: "That record already exists", code: "CONFLICT", requestId: req.id });
  }

  logger.error(`${req.method} ${req.path}`, err, { requestId: req.id });
  return res.status(500).json({
    error: env.isProd ? "Something went wrong. Please try again." : message,
    code: "INTERNAL_ERROR",
    requestId: req.id,
  });
}
