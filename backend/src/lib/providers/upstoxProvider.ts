import axios from "axios";
import type { CandlePoint, FundamentalsData, MarketDataProvider, Quote, Range } from "./types";
import { YahooProvider } from "./yahooProvider";
import { cache, TTL } from "../cache";
import { env } from "../../config/env";
import { logger } from "../logger";

/**
 * Upstox — official, broker-grade market data for NSE/BSE equities, used via
 * a free "Analytics" read-only access token (no paid Kite-style data fee).
 *
 * Scope deliberately narrow: Upstox only covers Indian equities, so this
 * class handles quotes/candles for NSE_EQ / BSE_EQ symbols itself and
 * delegates everything else — indices, global/US tickers, fundamentals,
 * symbol search — to an internal YahooProvider. If UPSTOX_ACCESS_TOKEN is
 * unset, or any individual Upstox call fails, that same Yahoo instance is
 * used as the fallback so behavior degrades to "exactly like before" rather
 * than breaking.
 */

const UA = "Mozilla/5.0 (compatible; BullHawk/1.0)";
const BASE = "https://api.upstox.com/v2";

type UpstoxInstrument = { exchangeSegment: "NSE_EQ" | "BSE_EQ"; bare: string } | null;

/** "RELIANCE.NS" -> {NSE_EQ, RELIANCE}; "RELIANCE.BO" -> {BSE_EQ, RELIANCE}; anything else (index/global) -> null, meaning "not ours, hand to Yahoo". */
function toUpstoxInstrument(providerSymbol: string): UpstoxInstrument {
  if (providerSymbol.endsWith(".NS")) return { exchangeSegment: "NSE_EQ", bare: providerSymbol.replace(/\.NS$/, "") };
  if (providerSymbol.endsWith(".BO")) return { exchangeSegment: "BSE_EQ", bare: providerSymbol.replace(/\.BO$/, "") };
  return null;
}

function instrumentKey(inst: NonNullable<UpstoxInstrument>): string {
  return `${inst.exchangeSegment}:${inst.bare}`;
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": UA,
    Authorization: `Bearer ${env.upstoxAccessToken}`,
  };
}

function quoteFromOhlc(providerSymbol: string, inst: NonNullable<UpstoxInstrument>, raw: {
  ohlc?: { open?: number; high?: number; low?: number; close?: number };
  last_price?: number;
}): Quote | null {
  const price = raw.last_price ?? raw.ohlc?.close;
  if (price == null) return null;
  return {
    symbol: providerSymbol,
    displaySymbol: inst.bare,
    exchange: inst.exchangeSegment === "NSE_EQ" ? "NSE" : "BSE",
    currency: "INR",
    price,
    prevClose: raw.ohlc?.close ?? null, // Upstox OHLC's "close" is the last completed session's close when queried intraday
    open: raw.ohlc?.open ?? null,
    dayHigh: raw.ohlc?.high ?? null,
    dayLow: raw.ohlc?.low ?? null,
    week52High: null, // not returned by this endpoint — Yahoo fallback covers callers that need it
    week52Low: null,
    volume: null,
    avgVolume: null,
    marketState: undefined,
    quoteTime: undefined,
  };
}

/** Range -> Upstox historical-candle interval + lookback window. Kept conservative;
 * if Upstox rejects a window (history-depth limits aren't fully documented),
 * the caller catches and falls back to Yahoo for that request. */
function candleParams(range: Range): { interval: string; days: number } {
  switch (range) {
    case "1D": return { interval: "30minute", days: 1 };
    case "1W": return { interval: "30minute", days: 7 };
    case "1M": return { interval: "day", days: 31 };
    case "3M": return { interval: "day", days: 93 };
    case "6M": return { interval: "day", days: 186 };
    case "1Y": return { interval: "day", days: 366 };
    case "5Y": return { interval: "week", days: 365 * 5 };
    case "MAX": return { interval: "month", days: 365 * 20 };
  }
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class UpstoxProvider implements MarketDataProvider {
  readonly id = "upstox";
  private yahoo = new YahooProvider();

  private get configured() {
    return Boolean(env.upstoxAccessToken);
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const inst = toUpstoxInstrument(symbol);
    if (!inst || !this.configured) return this.yahoo.getQuote(symbol);

    const { value } = await cache.wrap<Quote | null>(`upstox:quote:${symbol}`, TTL.quote, async () => {
      try {
        const res = await axios.get(`${BASE}/market-quote/ohlc`, {
          params: { instrument_key: instrumentKey(inst), interval: "1d" },
          headers: authHeaders(),
          timeout: 8000,
          validateStatus: () => true,
        });
        if (res.status !== 200 || res.data?.status !== "success") return null;
        const raw = res.data?.data?.[instrumentKey(inst)];
        return raw ? quoteFromOhlc(symbol, inst, raw) : null;
      } catch (err) {
        logger.warn("[upstox] getQuote failed", { symbol, err: String(err) });
        return null;
      }
    });
    return value ?? this.yahoo.getQuote(symbol);
  }

  async getQuotes(symbols: string[]): Promise<Record<string, Quote | null>> {
    if (!this.configured) return this.yahoo.getQuotes(symbols);

    const upstoxable = symbols.filter((s) => toUpstoxInstrument(s) !== null);
    const rest = symbols.filter((s) => toUpstoxInstrument(s) === null);

    const out: Record<string, Quote | null> = {};

    // Upstox allows up to 500 instrument keys per call; batch at 400 to be safe.
    for (let i = 0; i < upstoxable.length; i += 400) {
      const batch = upstoxable.slice(i, i + 400);
      const keyToSymbol = new Map<string, string>();
      const keys: string[] = [];
      for (const s of batch) {
        const inst = toUpstoxInstrument(s)!;
        const k = instrumentKey(inst);
        keyToSymbol.set(k, s);
        keys.push(k);
      }
      try {
        const res = await axios.get(`${BASE}/market-quote/ohlc`, {
          params: { instrument_key: keys.join(","), interval: "1d" },
          headers: authHeaders(),
          timeout: 10000,
          validateStatus: () => true,
        });
        if (res.status === 200 && res.data?.status === "success") {
          const data = res.data.data ?? {};
          for (const [key, sym] of keyToSymbol) {
            const inst = toUpstoxInstrument(sym)!;
            const raw = data[key];
            out[sym] = raw ? quoteFromOhlc(sym, inst, raw) : null;
          }
        } else {
          for (const sym of batch) out[sym] = null;
        }
      } catch (err) {
        logger.warn("[upstox] getQuotes batch failed", { count: batch.length, err: String(err) });
        for (const sym of batch) out[sym] = null;
      }
    }

    // Fall back to Yahoo for anything Upstox doesn't cover (indices/global)
    // plus any NSE/BSE symbol Upstox failed to price.
    const needsFallback = [...rest, ...upstoxable.filter((s) => !out[s])];
    if (needsFallback.length > 0) {
      const fallback = await this.yahoo.getQuotes(needsFallback);
      Object.assign(out, fallback);
    }
    return out;
  }

  async getCandles(symbol: string, range: Range): Promise<CandlePoint[]> {
    const inst = toUpstoxInstrument(symbol);
    if (!inst || !this.configured) return this.yahoo.getCandles(symbol, range);

    const { interval, days } = candleParams(range);
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

    const { value } = await cache.wrap<CandlePoint[]>(`upstox:candles:${symbol}:${range}`, TTL.candles, async () => {
      try {
        const url = `${BASE}/historical-candle/${encodeURIComponent(instrumentKey(inst))}/${interval}/${fmtDate(to)}/${fmtDate(from)}`;
        const res = await axios.get(url, { headers: authHeaders(), timeout: 12000, validateStatus: () => true });
        if (res.status !== 200 || res.data?.status !== "success") return [];
        const candles = res.data?.data?.candles as Array<[string, number, number, number, number, number, number]> | undefined;
        if (!Array.isArray(candles)) return [];
        return candles
          .map((c) => ({
            time: Math.floor(new Date(c[0]).getTime() / 1000),
            open: c[1],
            high: c[2],
            low: c[3],
            close: c[4],
            volume: c[5],
          }))
          .sort((a, b) => a.time - b.time);
      } catch (err) {
        logger.warn("[upstox] getCandles failed", { symbol, range, err: String(err) });
        return [];
      }
    });
    return value.length > 0 ? value : this.yahoo.getCandles(symbol, range);
  }

  // Upstox's read-only analytics token has no fundamentals/search coverage —
  // both stay on Yahoo unconditionally rather than half-implementing them.
  async getFundamentals(symbol: string): Promise<FundamentalsData | null> {
    return this.yahoo.getFundamentals(symbol);
  }

  async search(query: string, limit?: number): Promise<Array<{ symbol: string; name: string; exchange: string; type: string }>> {
    return this.yahoo.search(query, limit);
  }
}
