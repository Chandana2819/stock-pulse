import axios from "axios";
import type { CandlePoint, MarketDataProvider, Quote, Range } from "./types";
import { exchangeFromProviderSymbol } from "../symbols";

const RANGE_MAP: Record<Range, { range: string; interval: string }> = {
  "1D": { range: "1d", interval: "5m" },
  "1W": { range: "5d", interval: "15m" },
  "1M": { range: "1mo", interval: "1d" },
  "3M": { range: "3mo", interval: "1d" },
  "6M": { range: "6mo", interval: "1d" },
  "1Y": { range: "1y", interval: "1d" },
  "5Y": { range: "5y", interval: "1wk" },
  "MAX": { range: "max", interval: "1mo" },
};

// Simple in-memory cache to avoid hammering Yahoo on every dashboard refresh.
// Fine for a single dev/personal-use server; swap for Redis if this ever
// runs multi-instance.
type CacheEntry<T> = { value: T; expiresAt: number };
const quoteCache = new Map<string, CacheEntry<Quote | null>>();
const candleCache = new Map<string, CacheEntry<CandlePoint[]>>();
const QUOTE_TTL_MS = 15_000;
const CANDLE_TTL_MS = 60_000;

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  return undefined;
}
function setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

type YahooChartResult = {
  meta?: Record<string, number | string | undefined>;
  timestamp?: number[];
  indicators?: { quote?: Array<{ open?: number[]; high?: number[]; low?: number[]; close?: number[]; volume?: number[] }> };
};

async function fetchChart(symbol: string, range: string, interval: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const res = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 8000,
  });
  return (res.data?.chart?.result?.[0] as YahooChartResult | undefined) ?? null;
}

function num(v: number | string | undefined): number | null {
  return typeof v === "number" ? v : null;
}
function str(v: number | string | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function quoteFromChartResult(providerSymbol: string, result: YahooChartResult | null): Quote | null {
  if (!result) return null;
  const meta = result.meta ?? {};
  const price = num(meta.regularMarketPrice);
  if (price == null) return null;

  return {
    symbol: providerSymbol,
    displaySymbol: providerSymbol.replace(/^\^/, "").replace(/\.(NS|BO)$/, ""),
    exchange: exchangeFromProviderSymbol(providerSymbol),
    currency: str(meta.currency) ?? (exchangeFromProviderSymbol(providerSymbol) === "GLOBAL" ? "USD" : "INR"),
    price,
    prevClose: num(meta.chartPreviousClose) ?? num(meta.previousClose),
    dayHigh: num(meta.regularMarketDayHigh),
    dayLow: num(meta.regularMarketDayLow),
    week52High: num(meta.fiftyTwoWeekHigh),
    week52Low: num(meta.fiftyTwoWeekLow),
    volume: num(meta.regularMarketVolume),
    avgVolume: num(meta.averageDailyVolume10Day) ?? num(meta.averageDailyVolume3Month),
    marketState: str(meta.marketState),
  };
}

export class YahooProvider implements MarketDataProvider {
  readonly id = "yahoo-finance";

  async getQuote(symbol: string): Promise<Quote | null> {
    const cached = getCached(quoteCache, symbol);
    if (cached !== undefined) return cached;

    let quote: Quote | null = null;
    try {
      const result = await fetchChart(symbol, "5d", "1d");
      quote = quoteFromChartResult(symbol, result);
    } catch {
      quote = null;
    }
    setCached(quoteCache, symbol, quote, QUOTE_TTL_MS);
    return quote;
  }

  async getQuotes(symbols: string[]): Promise<Record<string, Quote | null>> {
    const entries = await Promise.all(
      symbols.map(async (s) => [s, await this.getQuote(s)] as const)
    );
    return Object.fromEntries(entries);
  }

  async getCandles(symbol: string, range: Range): Promise<CandlePoint[]> {
    const cacheKey = `${symbol}:${range}`;
    const cached = getCached(candleCache, cacheKey);
    if (cached !== undefined) return cached;

    const { range: r, interval } = RANGE_MAP[range];
    let candles: CandlePoint[] = [];
    try {
      const result = await fetchChart(symbol, r, interval);
      const timestamps: number[] = result?.timestamp ?? [];
      const quote = result?.indicators?.quote?.[0] ?? {};
      const opens: number[] = quote.open ?? [];
      const highs: number[] = quote.high ?? [];
      const lows: number[] = quote.low ?? [];
      const closes: number[] = quote.close ?? [];
      const volumes: number[] = quote.volume ?? [];

      candles = timestamps
        .map((t, i) => ({
          time: t,
          open: opens[i],
          high: highs[i],
          low: lows[i],
          close: closes[i],
          volume: volumes[i],
        }))
        .filter((c) => c.open != null && c.high != null && c.low != null && c.close != null);
    } catch {
      candles = [];
    }
    setCached(candleCache, cacheKey, candles, CANDLE_TTL_MS);
    return candles;
  }
}
