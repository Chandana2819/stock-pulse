// Core data-provider abstraction.
//
// The rest of the app (API routes, risk engine, UI) should only ever talk to
// these interfaces — never to a specific vendor (Yahoo, a paid API, etc.)
// directly. Swapping data sources later means writing a new class that
// implements these interfaces and changing one line in providers/index.ts.

export type CandlePoint = {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type Quote = {
  /** Normalized internal symbol, e.g. "RELIANCE.NS", "AAPL" */
  symbol: string;
  /** Symbol as a human would type/read it, e.g. "RELIANCE", "AAPL" */
  displaySymbol: string;
  exchange: "NSE" | "BSE" | "GLOBAL" | "INDEX";
  currency: string;
  price: number;
  prevClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  week52High: number | null;
  week52Low: number | null;
  volume: number | null;
  avgVolume: number | null;
  marketState?: string;
};

export type Range = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "5Y" | "MAX";

export interface MarketDataProvider {
  /** Human-readable id, e.g. "yahoo-finance" — surfaced in API responses for debugging/attribution. */
  readonly id: string;

  /** Fetch a single quote. Returns null if the symbol can't be resolved. */
  getQuote(symbol: string): Promise<Quote | null>;

  /** Fetch OHLC candles for charting. Returns [] if unavailable. */
  getCandles(symbol: string, range: Range): Promise<CandlePoint[]>;

  /** Fetch several quotes at once (indices, watchlist, etc.), best-effort per symbol. */
  getQuotes(symbols: string[]): Promise<Record<string, Quote | null>>;
}

export type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
};

export interface NewsProvider {
  readonly id: string;
  getNews(query: string, limit?: number): Promise<NewsItem[]>;
}
