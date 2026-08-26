// Normalizes anything a user might type ("RELIANCE", "reliance.ns", "AAPL",
// "NIFTY 50") into the ticker format the data provider expects, and back into a
// clean display symbol. Keeping this in one place is what lets the UI stay
// provider-agnostic.

export type ResolvedSymbol = {
  /** Ticker to send to the data provider, e.g. "RELIANCE.NS" */
  providerSymbol: string;
  /** What to show the user, e.g. "RELIANCE" */
  displaySymbol: string;
  exchange: "NSE" | "BSE" | "GLOBAL" | "INDEX";
};

// Well-known Indian & global indices. Yahoo uses "^" prefixed tickers for these.
const INDEX_ALIASES: Record<string, { ticker: string; display: string }> = {
  NIFTY: { ticker: "^NSEI", display: "NIFTY 50" },
  NIFTY50: { ticker: "^NSEI", display: "NIFTY 50" },
  "NIFTY 50": { ticker: "^NSEI", display: "NIFTY 50" },
  SENSEX: { ticker: "^BSESN", display: "SENSEX" },
  BANKNIFTY: { ticker: "^NSEBANK", display: "BANK NIFTY" },
  "BANK NIFTY": { ticker: "^NSEBANK", display: "BANK NIFTY" },
  INDIAVIX: { ticker: "^INDIAVIX", display: "INDIA VIX" },
  VIX: { ticker: "^INDIAVIX", display: "INDIA VIX" },
  NIFTYIT: { ticker: "^CNXIT", display: "NIFTY IT" },
  "NIFTY IT": { ticker: "^CNXIT", display: "NIFTY IT" },
  NIFTYMIDCAP: { ticker: "^NSEMDCP50", display: "NIFTY MIDCAP 50" },
  NIFTYSMALLCAP: { ticker: "^CNXSC", display: "NIFTY SMALLCAP" },
  SPX: { ticker: "^GSPC", display: "S&P 500" },
  SP500: { ticker: "^GSPC", display: "S&P 500" },
  "S&P500": { ticker: "^GSPC", display: "S&P 500" },
  NASDAQ: { ticker: "^IXIC", display: "NASDAQ" },
  DOWJONES: { ticker: "^DJI", display: "DOW JONES" },
  DOW: { ticker: "^DJI", display: "DOW JONES" },
  NIKKEI: { ticker: "^N225", display: "NIKKEI 225" },
  HANGSENG: { ticker: "^HSI", display: "HANG SENG" },
  FTSE: { ticker: "^FTSE", display: "FTSE 100" },
  DAX: { ticker: "^GDAXI", display: "DAX" },
  GOLD: { ticker: "GC=F", display: "GOLD" },
  SILVER: { ticker: "SI=F", display: "SILVER" },
  CRUDE: { ticker: "BZ=F", display: "BRENT CRUDE" },
  USDINR: { ticker: "INR=X", display: "USD/INR" },
  BTC: { ticker: "BTC-USD", display: "BITCOIN" },
  ETH: { ticker: "ETH-USD", display: "ETHEREUM" },
};

/** Indices shown on the dashboard and fed into the market-risk engine. */
export const CORE_INDICES = [
  "NIFTY", "SENSEX", "BANKNIFTY", "NIFTYIT", "NIFTYMIDCAP", "NIFTYSMALLCAP", "INDIAVIX",
  "SPX", "NASDAQ", "DOW", "NIKKEI", "HANGSENG",
] as const;

/** Commodities / FX / crypto shown in the "global & macro" strip. */
export const MACRO_SYMBOLS = ["GOLD", "SILVER", "CRUDE", "USDINR", "BTC", "ETH"] as const;

/**
 * NSE sectoral indices. These are the real sector gauges used by the
 * "why is this stock moving" attribution and the sector-performance board.
 */
export const SECTOR_INDICES: { key: string; label: string; ticker: string }[] = [
  { key: "IT", label: "IT", ticker: "^CNXIT" },
  { key: "BANK", label: "Banking", ticker: "^NSEBANK" },
  { key: "AUTO", label: "Auto", ticker: "^CNXAUTO" },
  { key: "PHARMA", label: "Pharma", ticker: "^CNXPHARMA" },
  { key: "FMCG", label: "FMCG", ticker: "^CNXFMCG" },
  { key: "METAL", label: "Metal", ticker: "^CNXMETAL" },
  { key: "ENERGY", label: "Energy", ticker: "^CNXENERGY" },
  { key: "REALTY", label: "Realty", ticker: "^CNXREALTY" },
  { key: "FIN", label: "Financial Services", ticker: "NIFTY_FIN_SERVICE.NS" },
  { key: "PSUBANK", label: "PSU Bank", ticker: "^CNXPSUBANK" },
];

export function resolveIndexSymbol(name: string): ResolvedSymbol {
  const key = name.trim().toUpperCase();
  const alias = INDEX_ALIASES[key];
  if (alias) {
    return { providerSymbol: alias.ticker, displaySymbol: alias.display, exchange: "INDEX" };
  }
  return { providerSymbol: name, displaySymbol: name, exchange: "INDEX" };
}

export function isIndexAlias(name: string): boolean {
  return Boolean(INDEX_ALIASES[name.trim().toUpperCase()]);
}

/**
 * Resolve a plain user-typed stock symbol. Since we do not know a-priori
 * whether "TCS" means NSE or a global ticker, callers that need certainty
 * should try candidates in order via `stockSymbolCandidates` and keep the
 * first one that returns real data.
 */
export function stockSymbolCandidates(raw: string): ResolvedSymbol[] {
  const upper = raw.trim().toUpperCase();

  if (upper.startsWith("^") || upper.includes("=")) {
    return [{ providerSymbol: upper, displaySymbol: upper.replace(/^\^/, ""), exchange: "INDEX" }];
  }
  if (upper.endsWith(".NS")) {
    return [{ providerSymbol: upper, displaySymbol: upper.replace(/\.NS$/, ""), exchange: "NSE" }];
  }
  if (upper.endsWith(".BO")) {
    return [{ providerSymbol: upper, displaySymbol: upper.replace(/\.BO$/, ""), exchange: "BSE" }];
  }
  if (INDEX_ALIASES[upper]) {
    return [resolveIndexSymbol(upper)];
  }

  return [
    { providerSymbol: `${upper}.NS`, displaySymbol: upper, exchange: "NSE" },
    { providerSymbol: `${upper}.BO`, displaySymbol: upper, exchange: "BSE" },
    { providerSymbol: upper, displaySymbol: upper, exchange: "GLOBAL" },
  ];
}

export function exchangeFromProviderSymbol(symbol: string): "NSE" | "BSE" | "GLOBAL" | "INDEX" {
  if (symbol.startsWith("^") || symbol.includes("=")) return "INDEX";
  if (symbol.endsWith(".NS")) return "NSE";
  if (symbol.endsWith(".BO")) return "BSE";
  return "GLOBAL";
}

export function displaySymbolFromProviderSymbol(symbol: string): string {
  return symbol.replace(/^\^/, "").replace(/\.(NS|BO)$/, "");
}

export function currencyForSymbol(symbol: string): "INR" | "USD" {
  const ex = exchangeFromProviderSymbol(symbol);
  return ex === "NSE" || ex === "BSE" ? "INR" : "USD";
}
