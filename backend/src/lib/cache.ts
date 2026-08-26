// Cache abstraction.
//
// Uses Redis if env.redisUrl is configured, falling back to a per-process
// in-memory cache if connection fails or Redis is absent.
import { env } from "../config/env";
import { createClient } from "redis";

export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Returns the cached value, or computes + stores it. Stale values are served if the loader throws. */
  wrap<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<{ value: T; hit: boolean; stale: boolean }>;
}

type Entry = { value: unknown; expiresAt: number };

class MemoryCache implements Cache {
  private store = new Map<string, Entry>();
  private maxEntries = 5000;

  async get<T>(key: string): Promise<T | undefined> {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) return undefined;
    return hit.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    if (this.store.size > this.maxEntries) {
      const drop = Math.ceil(this.maxEntries * 0.1);
      let i = 0;
      for (const k of this.store.keys()) {
        this.store.delete(k);
        if (++i >= drop) break;
      }
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async wrap<T>(key: string, ttlMs: number, loader: () => Promise<T>) {
    const entry = this.store.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      return { value: entry.value as T, hit: true, stale: false };
    }
    try {
      const value = await loader();
      await this.set(key, value, ttlMs);
      return { value, hit: false, stale: false };
    } catch (err) {
      if (entry) return { value: entry.value as T, hit: true, stale: true };
      throw err;
    }
  }
}

class RedisCache implements Cache {
  private client: ReturnType<typeof createClient> | null = null;
  private fallback: MemoryCache;

  constructor() {
    this.fallback = new MemoryCache();
    if (env.redisUrl) {
      console.log(`[cache] Initializing Redis client at ${env.redisUrl}...`);
      this.client = createClient({ url: env.redisUrl });
      this.client.on("error", (err) => {
        console.warn("[cache] Redis client error:", err.message || err);
      });
      this.client.connect().catch((err) => {
        console.warn("[cache] Redis connection failed, using memory fallback:", err.message || err);
      });
    }
  }

  private isAvailable(): boolean {
    return !!(this.client && this.client.isOpen);
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (this.isAvailable()) {
      try {
        const raw = await this.client!.get(key);
        if (raw) return JSON.parse(raw) as T;
        return undefined;
      } catch (err) {
        console.error("[cache] Redis get failed, using fallback:", err);
      }
    }
    return this.fallback.get<T>(key);
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    if (this.isAvailable()) {
      try {
        await this.client!.set(key, JSON.stringify(value), { PX: ttlMs });
        return;
      } catch (err) {
        console.error("[cache] Redis set failed, using fallback:", err);
      }
    }
    await this.fallback.set(key, value, ttlMs);
  }

  async del(key: string): Promise<void> {
    if (this.isAvailable()) {
      try {
        await this.client!.del(key);
        return;
      } catch (err) {
        console.error("[cache] Redis del failed, using fallback:", err);
      }
    }
    await this.fallback.del(key);
  }

  async wrap<T>(key: string, ttlMs: number, loader: () => Promise<T>) {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return { value: cached, hit: true, stale: false };
    }
    try {
      const value = await loader();
      await this.set(key, value, ttlMs);
      return { value, hit: false, stale: false };
    } catch (err) {
      // Loader failed: attempt to retrieve a stale value from cache
      if (this.isAvailable()) {
        try {
          const raw = await this.client!.get(key);
          if (raw) {
            return { value: JSON.parse(raw) as T, hit: true, stale: true };
          }
        } catch {}
      }
      const memVal = await this.fallback.get<T>(key);
      if (memVal !== undefined) {
        return { value: memVal, hit: true, stale: true };
      }
      throw err;
    }
  }
}

export function createCache(): Cache {
  if (env.redisUrl) {
    return new RedisCache();
  }
  return new MemoryCache();
}

export const cache = createCache();

export const TTL = {
  quote: 15_000,
  candles: 60_000,
  fundamentals: 6 * 60 * 60 * 1000,
  news: 5 * 60 * 1000,
  sector: 60_000,
  funds: 60 * 60 * 1000,
  universe: 24 * 60 * 60 * 1000,
  screener: 5 * 60 * 1000,
  ipo: 12 * 60 * 60 * 1000,
  events: 6 * 60 * 60 * 1000,
};
