import { YahooProvider } from "./yahooProvider";
import { UpstoxProvider } from "./upstoxProvider";
import { GoogleNewsProvider } from "./googleNewsProvider";
import { MfApiFundProvider } from "./mfApiFundProvider";
import { LicensedIpoProvider } from "./ipoProvider";
import { RazorpayProvider } from "./razorpayProvider";
import type { FundProvider, IpoProvider, MarketDataProvider, NewsProvider, PaymentProvider } from "./types";
import { stockSymbolCandidates } from "../symbols";

export * from "./types";
export { listBrokers, getBroker } from "./brokerProvider";

// Swap these lines to change a data source app-wide. Everything else depends on
// the interfaces in ./types, not on a specific vendor.
// Upstox (official, free-with-account) handles NSE/BSE equity quotes/candles
// when UPSTOX_ACCESS_TOKEN is set; it transparently falls back to Yahoo for
// indices, global tickers, fundamentals, search, or any failed Upstox call —
// so leaving the token unset keeps today's all-Yahoo behavior unchanged.
export const marketDataProvider: MarketDataProvider = new UpstoxProvider();
export const newsProvider: NewsProvider = new GoogleNewsProvider();
export const fundProvider: FundProvider = new MfApiFundProvider();
export const ipoProvider: IpoProvider = new LicensedIpoProvider();
export const paymentProvider: PaymentProvider = new RazorpayProvider();

/**
 * Resolve a user-typed stock symbol to a real quote by trying NSE, then BSE,
 * then a global ticker, keeping the first that actually returns data.
 * Centralizing this here means API routes do not duplicate the fallback chain.
 */
export async function resolveStockQuote(raw: string) {
  const candidates = stockSymbolCandidates(raw);
  for (const candidate of candidates) {
    try {
      const quote = await marketDataProvider.getQuote(candidate.providerSymbol);
      if (quote) return { quote, resolved: candidate };
    } catch {
      // Ignore provider errors and continue testing other symbol candidates
    }
  }
  return { quote: null, resolved: candidates[candidates.length - 1] };
}
