import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

/**
 * Assigns a short request ID and logs one line per request on completion
 * (method, path, status, duration, requestId, and userId once attachUser has
 * run). This is what makes "something went wrong" reports traceable — the
 * same ID returned to the client in error responses (see middleware/error.ts)
 * can be grepped straight to the matching server-side log line.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  req.id = crypto.randomUUID().slice(0, 8);
  const start = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const message = `${req.method} ${req.path} ${res.statusCode}`;
    const context = {
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs,
      userId: req.user?.id,
    };

    if (res.statusCode >= 500) logger.error(message, undefined, context);
    else if (res.statusCode >= 400) logger.warn(message, context);
    else logger.info(message, context);
  });

  next();
}
