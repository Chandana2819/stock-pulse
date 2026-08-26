import { YahooProvider } from "./yahooProvider";
import type { MarketDataProvider } from "./types";
import { stockSymbolCandidates } from "../symbols";

export * from "./types";

// Swap this line to change the underlying data source app-wide. Everything
// else in the app depends on the MarketDataProvider interface, not on Yahoo.
export const marketDataProvider: MarketDataProvider = new YahooProvider();

/**
 * Resolve a user-typed stock symbol to a real quote by trying NSE, then BSE,
 * then a global ticker, keeping the first one that actually returns data.
 * Centralizing this here means API routes don't duplicate the fallback chain.
 */
export async function resolveStockQuote(raw: string) {
  const candidates = stockSymbolCandidates(raw);
  for (const candidate of candidates) {
    const quote = await marketDataProvider.getQuote(candidate.providerSymbol);
    if (quote) return { quote, resolved: candidate };
  }
  return { quote: null, resolved: candidates[candidates.length - 1] };
}
