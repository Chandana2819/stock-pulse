import axios from "axios";
import type { CandlePoint, FundamentalsData, MarketDataProvider, Quote, Range } from "./types";
import { exchangeFromProviderSymbol } from "../symbols";
import { cache, TTL } from "../cache";

const RANGE_MAP: Record<Range, { range: string; interval: string }> = {
  "1D": { range: "1d", interval: "5m" },
  "1W": { range: "5d", interval: "15m" },
  "1M": { range: "1mo", interval: "1d" },
  "3M": { range: "3mo", interval: "1d" },
  "6M": { range: "6mo", interval: "1d" },
  "1Y": { range: "1y", interval: "1d" },
  "5Y": { range: "5y", interval: "1d" },
  MAX: { range: "max", interval: "1mo" },
};

const UA = "Mozilla/5.0 (compatible; StockPulse/1.0)";

type YahooChartResult = {
  meta?: Record<string, number | string | undefined>;
  timestamp?: number[];
  indicators?: {
    quote?: Array<{ open?: number[]; high?: number[]; low?: number[]; close?: number[]; volume?: number[] }>;
  };
};

// Yahoo's quoteSummary endpoint (used for fundamentals) requires a session
// cookie + "crumb" token since Yahoo tightened unauthenticated access — the
// chart/search endpoints used elsewhere in this file do not. We fetch and
// cache the cookie/crumb pair once and reuse it for the process lifetime,
// refreshing on a 401.
let yahooSession: { cookie: string; crumb: string } | null = null;
let yahooSessionPromise: Promise<{ cookie: string; crumb: string } | null> | null = null;

async function fetchYahooSession(): Promise<{ cookie: string; crumb: string } | null> {
  try {
    const res1 = await axios.get("https://fc.yahoo.com", { headers: { "User-Agent": UA }, timeout: 8000, validateStatus: () => true });
    const cookie = (res1.headers["set-cookie"] ?? []).map((c) => c.split(";")[0]).join("; ");
    if (!cookie) return null;
    const res2 = await axios.get("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, Cookie: cookie },
      timeout: 8000,
    });
    const crumb = String(res2.data ?? "").trim();
    if (!crumb) return null;
    return { cookie, crumb };
  } catch {
    return null;
  }
}

async function getYahooSession(forceRefresh = false): Promise<{ cookie: string; crumb: string } | null> {
  if (yahooSession && !forceRefresh) return yahooSession;
  if (!yahooSessionPromise || forceRefresh) {
    yahooSessionPromise = fetchYahooSession().then((s) => {
      yahooSession = s;
      return s;
    });
  }
  return yahooSessionPromise;
}

async function fetchChart(symbol: string, range: string, interval: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    const res = await axios.get(url, { headers: { "User-Agent": UA }, timeout: 9000 });
    return (res.data?.chart?.result?.[0] as YahooChartResult | undefined) ?? null;
  } catch {
    return null;
  }
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && "raw" in (v as Record<string, unknown>)) {
    const raw = (v as { raw?: unknown }).raw;
    return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  }
  return null;
}
function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function pct(v: unknown): number | null {
  const n = num(v);
  return n == null ? null : n * 100;
}

function quoteFromChartResult(providerSymbol: string, result: YahooChartResult | null): Quote | null {
  if (!result) return null;
  const meta = result.meta ?? {};
  const price = num(meta.regularMarketPrice);
  if (price == null) return null;
  const exchange = exchangeFromProviderSymbol(providerSymbol);

  return {
    symbol: providerSymbol,
    displaySymbol: providerSymbol.replace(/^\^/, "").replace(/\.(NS|BO)$/, ""),
    exchange,
    currency: str(meta.currency) ?? (exchange === "GLOBAL" ? "USD" : "INR"),
    price,
    prevClose: num(meta.chartPreviousClose) ?? num(meta.previousClose),
    open: num(meta.regularMarketOpen),
    dayHigh: num(meta.regularMarketDayHigh),
    dayLow: num(meta.regularMarketDayLow),
    week52High: num(meta.fiftyTwoWeekHigh),
    week52Low: num(meta.fiftyTwoWeekLow),
    volume: num(meta.regularMarketVolume),
    avgVolume: num(meta.averageDailyVolume10Day) ?? num(meta.averageDailyVolume3Month),
    marketState: str(meta.marketState) ?? undefined,
    quoteTime: num(meta.regularMarketTime) ?? undefined,
  };
}

export class YahooProvider implements MarketDataProvider {
  readonly id = "yahoo-finance";

  async getQuote(symbol: string): Promise<Quote | null> {
    const { value } = await cache.wrap<Quote | null>(`quote:${symbol}`, TTL.quote, async () => {
      const result = await fetchChart(symbol, "5d", "1d");
      return quoteFromChartResult(symbol, result);
    });
    return value;
  }

  async getQuotes(symbols: string[]): Promise<Record<string, Quote | null>> {
    // Bounded concurrency: a 200-symbol screener run must not open 200 sockets.
    const out: Record<string, Quote | null> = {};
    const batchSize = 12;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (s) => {
          try {
            return [s, await this.getQuote(s)] as const;
          } catch {
            return [s, null] as const;
          }
        })
      );
      for (const [s, q] of results) out[s] = q;
    }
    return out;
  }

  async getCandles(symbol: string, range: Range): Promise<CandlePoint[]> {
    const { value } = await cache.wrap<CandlePoint[]>(`candles:${symbol}:${range}`, TTL.candles, async () => {
      const { range: r, interval } = RANGE_MAP[range];
      const result = await fetchChart(symbol, r, interval);
      const timestamps: number[] = result?.timestamp ?? [];
      const q = result?.indicators?.quote?.[0] ?? {};
      const opens = q.open ?? [];
      const highs = q.high ?? [];
      const lows = q.low ?? [];
      const closes = q.close ?? [];
      const volumes = q.volume ?? [];

      const raw = timestamps.map((t, i) => ({
        time: t,
        open: opens[i] as number | undefined,
        high: highs[i] as number | undefined,
        low: lows[i] as number | undefined,
        close: closes[i] as number | undefined,
        volume: volumes[i] as number | undefined,
      }));
      return raw.filter((c) => c.open != null && c.high != null && c.low != null && c.close != null && Number.isFinite(c.close)) as CandlePoint[];
    });
    return value;
  }

  async getFundamentals(symbol: string): Promise<FundamentalsData | null> {
    const { value } = await cache.wrap<FundamentalsData | null>(`fundamentals:${symbol}`, TTL.fundamentals, async () => {
      const modules = [
        "assetProfile",
        "summaryDetail",
        "defaultKeyStatistics",
        "financialData",
        "majorHoldersBreakdown",
        "price",
      ].join(",");
      const fetchWithSession = async (forceRefresh: boolean) => {
        const session = await getYahooSession(forceRefresh);
        const params = new URLSearchParams({ modules });
        if (session?.crumb) params.set("crumb", session.crumb);
        const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?${params.toString()}`;
        return axios.get(url, {
          headers: { "User-Agent": UA, ...(session?.cookie ? { Cookie: session.cookie } : {}) },
          timeout: 10000,
          validateStatus: () => true,
        });
      };

      let res = await fetchWithSession(false);
      if (res.status === 401) res = await fetchWithSession(true); // crumb/cookie likely expired — refresh once
      if (res.status !== 200) return null;

      const r = res.data?.quoteSummary?.result?.[0];
      if (!r) return null;

      const profile = r.assetProfile ?? {};
      const summary = r.summaryDetail ?? {};
      const stats = r.defaultKeyStatistics ?? {};
      const fin = r.financialData ?? {};
      const holders = r.majorHoldersBreakdown ?? {};
      const price = r.price ?? {};

      const data: FundamentalsData = {
        symbol,
        name: str(price.longName) ?? str(price.shortName),
        sector: str(profile.sector),
        industry: str(profile.industry),
        country: str(profile.country),
        marketCap: num(summary.marketCap) ?? num(price.marketCap),
        peRatio: num(summary.trailingPE),
        forwardPe: num(summary.forwardPE),
        pbRatio: num(stats.priceToBook),
        roe: pct(fin.returnOnEquity),
        // Yahoo has no ROCE. Rather than invent one we leave it null and let the
        // UI say "not available" — see `missing` below.
        roce: null,
        debtToEquity: num(fin.debtToEquity) != null ? (num(fin.debtToEquity) as number) / 100 : null,
        revenueGrowth: pct(fin.revenueGrowth),
        profitGrowth: pct(fin.earningsGrowth),
        epsGrowth: pct(stats.earningsQuarterlyGrowth),
        eps: num(stats.trailingEps) ?? num(summary.trailingEps),
        dividendYield: pct(summary.dividendYield) ?? num(summary.dividendYield),
        bookValue: num(stats.bookValue),
        revenue: num(fin.totalRevenue),
        netIncome: num(stats.netIncomeToCommon),
        ebitda: num(fin.ebitda),
        totalDebt: num(fin.totalDebt),
        totalCash: num(fin.totalCash),
        freeCashFlow: num(fin.freeCashflow),
        promoterHolding: pct(holders.insidersPercentHeld),
        fiiHolding: pct(holders.institutionsPercentHeld),
        diiHolding: null, // Requires an Indian shareholding-pattern feed.
        beta: num(summary.beta) ?? num(stats.beta),
        missing: [],
        source: this.id,
        fetchedAt: new Date().toISOString(),
      };

      data.missing = (Object.keys(data) as (keyof FundamentalsData)[])
        .filter((k) => k !== "missing" && data[k] === null)
        .map(String);

      return data;
    });
    return value;
  }

  async search(query: string, limit = 10) {
    try {
      const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=${limit}&newsCount=0`;
      const res = await axios.get(url, { headers: { "User-Agent": UA }, timeout: 8000 });
      const quotes: Array<Record<string, unknown>> = res.data?.quotes ?? [];
      return quotes
        .filter((q) => typeof q.symbol === "string")
        .map((q) => ({
          symbol: String(q.symbol),
          name: String(q.longname ?? q.shortname ?? q.symbol),
          exchange: String(q.exchDisp ?? q.exchange ?? ""),
          type: String(q.quoteType ?? "EQUITY"),
        }));
    } catch {
      return [];
    }
  }
}
