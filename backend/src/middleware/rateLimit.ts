import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/http";

type Bucket = { count: number; resetAt: number };

/**
 * Fixed-window rate limiter keyed by IP + bucket name. In-process, which is
 * correct for a single node; move the map to Redis when running more than one.
 */
export function rateLimit(opts: { name: string; limit: number; windowMs: number; keyFn?: (req: Request) => string }) {
  const buckets = new Map<string, Bucket>();

  // Bounded memory: sweep expired entries periodically rather than on every hit.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }, 60_000);
  sweep.unref?.();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${opts.name}:${opts.keyFn ? opts.keyFn(req) : req.ip || req.socket.remoteAddress || "unknown"}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      res.setHeader("X-RateLimit-Remaining", String(opts.limit - 1));
      return next();
    }

    bucket.count++;
    if (bucket.count > opts.limit) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      return next(ApiError.tooMany(`Too many requests. Try again in ${retryAfter}s.`));
    }
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, opts.limit - bucket.count)));
    next();
  };
}

// A single dashboard load fans out to a dozen+ endpoints (market, sectors,
// brief, portfolio, watchlist, notifications...), the screener fetches live
// fundamentals for the whole reference universe in one call, and several
// pages poll on an interval. A short 1-minute window (rather than a 15-minute
// cumulative one) means a legitimate burst never locks a user out for long;
// this still catches runaway loops and scripted abuse. It is not the line of
// defense against credential attacks — authLimiter/otpLimiter are much
// stricter and use a longer window for that.
export const globalLimiter = rateLimit({ name: "global", limit: 3000, windowMs: 60 * 1000 });
export const authLimiter = rateLimit({ name: "auth", limit: 20, windowMs: 15 * 60 * 1000 });
export const otpLimiter = rateLimit({ name: "otp", limit: 6, windowMs: 15 * 60 * 1000 });
export const aiLimiter = rateLimit({ name: "ai", limit: 40, windowMs: 10 * 60 * 1000 });
export const writeLimiter = rateLimit({ name: "write", limit: 150, windowMs: 5 * 60 * 1000 });
