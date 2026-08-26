import type { NextFunction, Request, Response } from "express";

/** Error type that carries an HTTP status so route handlers can just throw. */
export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = "ERROR", details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(msg: string, details?: unknown) {
    return new ApiError(400, msg, "BAD_REQUEST", details);
  }
  static unauthorized(msg = "Authentication required") {
    return new ApiError(401, msg, "UNAUTHORIZED");
  }
  static forbidden(msg = "You do not have access to this resource") {
    return new ApiError(403, msg, "FORBIDDEN");
  }
  static notFound(msg = "Not found") {
    return new ApiError(404, msg, "NOT_FOUND");
  }
  static conflict(msg: string) {
    return new ApiError(409, msg, "CONFLICT");
  }
  static tooMany(msg = "Too many requests") {
    return new ApiError(429, msg, "RATE_LIMITED");
  }
  static unavailable(msg: string) {
    return new ApiError(503, msg, "SERVICE_UNAVAILABLE");
  }
}

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;

/** Wraps an async handler so rejected promises reach the error middleware. */
export function asyncHandler(fn: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** Standard envelope for paginated list endpoints. */
export function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Metadata attached to every market-data response so the UI can show freshness. */
export type DataSourceMeta = {
  source: string;
  fetchedAt: string;
  /** "LIVE" while data is fresh, "DELAYED" when served from a stale cache, "UNAVAILABLE" on failure. */
  status: "LIVE" | "DELAYED" | "UNAVAILABLE";
  note?: string;
};

export function sourceMeta(
  source: string,
  status: DataSourceMeta["status"] = "LIVE",
  note?: string,
  fetchedAt: Date = new Date()
): DataSourceMeta {
  return { source, fetchedAt: fetchedAt.toISOString(), status, note };
}
