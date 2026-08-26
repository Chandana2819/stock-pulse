// Normalizes anything a user might type ("RELIANCE", "reliance.ns", "AAPL",
// "NIFTY 50") into the ticker format Yahoo Finance expects, and back into a
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
  "NIFTY": { ticker: "^NSEI", display: "NIFTY 50" },
  "NIFTY50": { ticker: "^NSEI", display: "NIFTY 50" },
  "NIFTY 50": { ticker: "^NSEI", display: "NIFTY 50" },
  "SENSEX": { ticker: "^BSESN", display: "SENSEX" },
  "BANKNIFTY": { ticker: "^NSEBANK", display: "BANK NIFTY" },
  "BANK NIFTY": { ticker: "^NSEBANK", display: "BANK NIFTY" },
  "INDIAVIX": { ticker: "^INDIAVIX", display: "INDIA VIX" },
  "VIX": { ticker: "^INDIAVIX", display: "INDIA VIX" },
  "SPX": { ticker: "^GSPC", display: "S&P 500" },
  "SP500": { ticker: "^GSPC", display: "S&P 500" },
  "S&P500": { ticker: "^GSPC", display: "S&P 500" },
  "NASDAQ": { ticker: "^IXIC", display: "NASDAQ" },
  "DOWJONES": { ticker: "^DJI", display: "DOW JONES" },
  "DOW": { ticker: "^DJI", display: "DOW JONES" },
  "NIKKEI": { ticker: "^N225", display: "NIKKEI 225" },
  "HANGSENG": { ticker: "^HSI", display: "HANG SENG" },
};

/** Standard set of indices used across the market dashboard & risk engine. */
export const CORE_INDICES = [
  "NIFTY", "SENSEX", "BANKNIFTY", "INDIAVIX", "SPX", "NASDAQ", "DOW", "NIKKEI", "HANGSENG",
] as const;

export function resolveIndexSymbol(name: string): ResolvedSymbol {
  const key = name.trim().toUpperCase();
  const alias = INDEX_ALIASES[key];
  if (alias) {
    return { providerSymbol: alias.ticker, displaySymbol: alias.display, exchange: "INDEX" };
  }
  return { providerSymbol: name, displaySymbol: name, exchange: "INDEX" };
}

/**
 * Resolve a plain user-typed stock symbol. Since we don't know a-priori
 * whether "TCS" means NSE or a global ticker, callers that need certainty
 * should try candidates in order via `stockSymbolCandidates` and keep the
 * first one that returns real data.
 */
export function stockSymbolCandidates(raw: string): ResolvedSymbol[] {
  const upper = raw.trim().toUpperCase();

  // Already has an explicit suffix — respect it.
  if (upper.endsWith(".NS")) {
    return [{ providerSymbol: upper, displaySymbol: upper.replace(/\.NS$/, ""), exchange: "NSE" }];
  }
  if (upper.endsWith(".BO")) {
    return [{ providerSymbol: upper, displaySymbol: upper.replace(/\.BO$/, ""), exchange: "BSE" }];
  }

  // Index name typed directly (e.g. "NIFTY", "SENSEX")
  if (INDEX_ALIASES[upper]) {
    return [resolveIndexSymbol(upper)];
  }

  // Otherwise try NSE, then BSE, then as a global ticker verbatim.
  return [
    { providerSymbol: `${upper}.NS`, displaySymbol: upper, exchange: "NSE" },
    { providerSymbol: `${upper}.BO`, displaySymbol: upper, exchange: "BSE" },
    { providerSymbol: upper, displaySymbol: upper, exchange: "GLOBAL" },
  ];
}

export function exchangeFromProviderSymbol(symbol: string): "NSE" | "BSE" | "GLOBAL" | "INDEX" {
  if (symbol.startsWith("^")) return "INDEX";
  if (symbol.endsWith(".NS")) return "NSE";
  if (symbol.endsWith(".BO")) return "BSE";
  return "GLOBAL";
}

export function displaySymbolFromProviderSymbol(symbol: string): string {
  return symbol.replace(/\.(NS|BO)$/, "");
}
