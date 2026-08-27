// Core data-provider abstractions.
//
// The rest of the app (API routes, engines, UI) only ever talks to these
// interfaces — never to a specific vendor. Swapping a data source means writing
// a new class that implements the interface and changing one line in
// providers/index.ts.

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
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  week52High: number | null;
  week52Low: number | null;
  volume: number | null;
  avgVolume: number | null;
  marketState?: string;
  /** When the provider says the price was last updated. */
  quoteTime?: number;
};

export type Range = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "5Y" | "MAX";

export type FundamentalsData = {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  marketCap: number | null;
  peRatio: number | null;
  forwardPe: number | null;
  pbRatio: number | null;
  roe: number | null;
  roce: number | null;
  debtToEquity: number | null;
  revenueGrowth: number | null;
  profitGrowth: number | null;
  epsGrowth: number | null;
  eps: number | null;
  dividendYield: number | null;
  bookValue: number | null;
  revenue: number | null;
  netIncome: number | null;
  ebitda: number | null;
  totalDebt: number | null;
  totalCash: number | null;
  freeCashFlow: number | null;
  promoterHolding: number | null;
  fiiHolding: number | null;
  diiHolding: number | null;
  beta: number | null;
  /** Which fields the provider could not supply, so the UI can say "not available". */
  missing: string[];
  source: string;
  fetchedAt: string;
};

export interface MarketDataProvider {
  /** Human-readable id, e.g. "yahoo-finance" — surfaced in API responses for attribution. */
  readonly id: string;

  getQuote(symbol: string): Promise<Quote | null>;
  getCandles(symbol: string, range: Range): Promise<CandlePoint[]>;
  getQuotes(symbols: string[]): Promise<Record<string, Quote | null>>;
  /** Company fundamentals. Returns null when the provider has no coverage. */
  getFundamentals(symbol: string): Promise<FundamentalsData | null>;
  /** Provider-side symbol search, used to widen results beyond the local universe. */
  search(query: string, limit?: number): Promise<Array<{ symbol: string; name: string; exchange: string; type: string }>>;
}

export type NewsItem = {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source: string;
};

export interface NewsProvider {
  readonly id: string;
  getNews(query: string, limit?: number): Promise<NewsItem[]>;
}

// ── Funds ──────────────────────────────────────────────────────────────

export type FundScheme = {
  schemeCode: string;
  schemeName: string;
  fundHouse?: string;
  category?: string;
  nav?: number | null;
  navDate?: string | null;
};

export type FundDetail = FundScheme & {
  history: Array<{ date: string; nav: number }>;
  returns: { oneMonth: number | null; sixMonth: number | null; oneYear: number | null; threeYear: number | null; fiveYear: number | null };
};

export interface FundProvider {
  readonly id: string;
  search(query: string, limit?: number): Promise<FundScheme[]>;
  getScheme(schemeCode: string): Promise<FundDetail | null>;
}

// ── IPO ────────────────────────────────────────────────────────────────

export type IpoListing = {
  name: string;
  symbol?: string;
  status: "UPCOMING" | "OPEN" | "CLOSED" | "LISTED";
  openDate?: string;
  closeDate?: string;
  priceBand?: string;
  lotSize?: number;
  issueSize?: string;
  subscription?: number | null;
  source: string;
  gmp?: number | null;
  gmpPct?: number | null;
  qibSub?: number | null;
  niiSub?: number | null;
  retailSub?: number | null;
};

export interface IpoProvider {
  readonly id: string;
  /** `configured` is false when no licensed IPO feed is wired up. */
  readonly configured: boolean;
  list(status?: IpoListing["status"]): Promise<IpoListing[]>;
}

// ── Brokers ────────────────────────────────────────────────────────────

export type BrokerHolding = { symbol: string; quantity: number; avgPrice: number; exchange: string };
export type BrokerOrder = {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number | null;
  status: string;
  placedAt: string;
};

export interface BrokerProvider {
  readonly id: string;
  readonly label: string;
  readonly configured: boolean;
  /** URL the user is redirected to in order to authorise us — OAuth only, never credentials. */
  getAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<{ accessToken: string; refreshToken?: string; externalUserId?: string; expiresAt?: Date }>;
  getHoldings(accessToken: string): Promise<BrokerHolding[]>;
  getOrders(accessToken: string): Promise<BrokerOrder[]>;
  getPositions?(accessToken: string): Promise<any[]>;
}

// ── Payments ───────────────────────────────────────────────────────────

export type PaymentIntent = {
  providerRef: string;
  amount: number;
  currency: string;
  status: string;
  /** Everything the client needs to open the provider's own checkout. */
  checkout: Record<string, string | number>;
};

export interface PaymentProvider {
  readonly id: string;
  readonly configured: boolean;
  createIntent(input: { amount: number; currency: string; userRef: string; note?: string }): Promise<PaymentIntent>;
  verifySignature(payload: Record<string, string>): boolean;
  getStatus(providerRef: string): Promise<string>;
}
