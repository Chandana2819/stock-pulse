// Aggregates everything needed to fully describe one stock: quote,
// candles/indicators, fundamentals, sector context, recent news with
// sentiment, the "why is it moving" attribution, and the explainable decision.
// Both the legacy /api/analyze endpoint and the new /api/stocks/:symbol
// endpoint are thin wrappers around this so the two never drift apart.

import { marketDataProvider, newsProvider, resolveStockQuote } from "../providers";
import { computeIndicators, pctChange } from "../indicators";
import { analyzeHeadline } from "../engine/sentiment";
import { explainMove } from "../engine/whyMoving";
import { computeDecision, type DecisionInput } from "../engine/decision";
import { getSectorChangeForKey } from "./market";
import { lookupUniverse } from "../universe";
import { sourceMeta } from "../http";

export type StockAnalysisOptions = {
  ownedQuantity?: number;
  portfolioWeightPct?: number;
  riskTolerance?: "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE";
  horizonYears?: number;
  marketRiskScore?: number | null;
  newsLimit?: number;
};

export async function buildStockAnalysis(rawSymbol: string, opts: StockAnalysisOptions = {}) {
  const { quote, resolved } = await resolveStockQuote(rawSymbol);
  if (!quote) {
    return { found: false as const, resolved };
  }

  const symbol = resolved.providerSymbol;
  const entry = lookupUniverse(symbol);
  const sectorKey = entry?.sectorKey ?? null;

  const [candles, fundamentals, newsRaw, sectorChangePct] = await Promise.all([
    marketDataProvider.getCandles(symbol, "6M"),
    marketDataProvider.getFundamentals(symbol).catch(() => null),
    newsProvider.getNews(`${resolved.displaySymbol} stock`, opts.newsLimit ?? 10).catch(() => []),
    getSectorChangeForKey(sectorKey).catch(() => null),
  ]);

  // Data Validation
  let validationFailed = false;
  let validationReason = "";

  if (quote.price == null || quote.price <= 0) {
    validationFailed = true;
    validationReason = "Current market price is unavailable or invalid.";
  } else if (!quote.quoteTime) {
    validationFailed = true;
    validationReason = "Market price timestamp is missing.";
  } else if (quote.dayHigh != null && quote.dayLow != null && quote.dayHigh < quote.dayLow) {
    validationFailed = true;
    validationReason = "Invalid daily high/low values.";
  } else if (quote.volume != null && quote.volume < 0) {
    validationFailed = true;
    validationReason = "Invalid trading volume.";
  } else if (!candles || candles.length < 30) {
    validationFailed = true;
    validationReason = "Insufficient historical data (requires at least 30 trading days).";
  }

  const nowSecs = Date.now() / 1000;
  const dataAgeSecs = Math.max(0, nowSecs - (quote.quoteTime ?? 0));
  const isStale = dataAgeSecs > 7 * 24 * 3600; // older than 7 days
  if (isStale && !validationFailed) {
    validationFailed = true;
    validationReason = "Market data is stale.";
  }

  const indicators = candles.length >= 5 ? computeIndicators(candles) : null;
  const priceChangePct = pctChange(quote.price, quote.prevClose);

  const news = newsRaw.map((n) => ({ ...n, analysis: analyzeHeadline(n.title, resolved.displaySymbol) }));
  const relevantNews = news.filter(
    (n) => n.analysis.symbols.includes(symbol) || (sectorKey && n.analysis.sectors.includes(sectorKey))
  );
  const newsSentimentScore = relevantNews.length
    ? relevantNews.reduce((a, n) => a + n.analysis.sentimentScore, 0) / relevantNews.length
    : null;

  const attribution =
    priceChangePct != null
      ? explainMove({
          symbol,
          stockChangePct: priceChangePct,
          marketChangePct: null,
          sectorChangePct,
          volume: quote.volume,
          avgVolume: quote.avgVolume,
          rsi14: indicators?.rsi14 ?? null,
          news: news.map((n) => ({ title: n.title, analysis: n.analysis })),
        })
      : null;

  const decisionInput: DecisionInput = {
    fundamentals,
    indicators,
    priceChangePct,
    marketRiskScore: opts.marketRiskScore ?? null,
    sectorChangePct,
    newsSentimentScore,
    volatility30d: indicators?.volatility30d ?? null,
    avgVolume: quote.avgVolume,
    volume: quote.volume,
    ownedQuantity: opts.ownedQuantity ?? 0,
    portfolioWeightPct: opts.portfolioWeightPct ?? null,
    riskTolerance: opts.riskTolerance ?? "MODERATE",
    horizonYears: opts.horizonYears ?? 5,
  };

  let decision: any;

  if (validationFailed) {
    decision = {
      decision: "WAIT" as const,
      confidence: 0,
      totalScore: 0,
      pillars: [],
      reasons: [],
      mainRisk: validationReason,
      wouldChange: [],
      validationFailed: true,
      validationReason,
      riskLevel: "MODERATE" as const,
      dataFreshness: "STALE" as const,
      dataTimestamp: quote.quoteTime ? new Date(quote.quoteTime * 1000).toISOString() : new Date().toISOString(),
      dataSource: marketDataProvider.id,
      marketStatus: "CLOSED" as const,
      entryZone: { min: 0, max: 0 },
      stopLoss: 0,
      targetRange: { min: 0, max: 0 }
    };
  } else {
    const calculatedDecision = computeDecision(decisionInput);

    // Calculate Entry Zone, Stop-Loss, and Target Range
    const price = quote.price;
    const atrVal = indicators?.atr14 ?? (price * 0.025); // Fallback to 2.5% ATR
    const stopLoss = Number((price - 2 * atrVal).toFixed(2));
    const entryMin = Number((price - 0.015 * price).toFixed(2));
    const entryMax = Number((price + 0.005 * price).toFixed(2));
    const targetMin = Number((price + 0.08 * price).toFixed(2));
    const targetMax = Number((price + 0.15 * price).toFixed(2));

    // Calculate Risk Level (LOW, MODERATE, HIGH, VERY HIGH)
    const vol = indicators?.volatility30d ?? 30;
    const beta = fundamentals?.beta ?? 1.0;
    const marketRisk = opts.marketRiskScore ?? 50;
    let riskScore = vol * 0.4 + beta * 20 + marketRisk * 0.2;
    
    let riskLevel: "LOW" | "MODERATE" | "HIGH" | "VERY HIGH" = "MODERATE";
    if (riskScore > 65) riskLevel = "VERY HIGH";
    else if (riskScore > 45) riskLevel = "HIGH";
    else if (riskScore > 25) riskLevel = "MODERATE";
    else riskLevel = "LOW";

    // Determine Market Status
    const marketState = quote.marketState ?? "CLOSED";
    const marketStatus = marketState === "REGULAR" ? "OPEN" :
                         marketState.includes("PRE") ? "PRE_MARKET" :
                         marketState.includes("POST") ? "POST_MARKET" : "CLOSED";

    // Determine Data Freshness
    let dataFreshness: "LIVE" | "DELAYED" | "STALE" = "LIVE";
    if (marketStatus === "OPEN") {
      if (dataAgeSecs < 15 * 60) dataFreshness = "LIVE";
      else if (dataAgeSecs < 24 * 3600) dataFreshness = "DELAYED";
      else dataFreshness = "STALE";
    } else {
      if (dataAgeSecs < 72 * 3600) dataFreshness = "LIVE";
      else dataFreshness = "STALE";
    }

    decision = {
      ...calculatedDecision,
      validationFailed: false,
      validationReason: "",
      riskLevel,
      dataFreshness,
      dataTimestamp: quote.quoteTime ? new Date(quote.quoteTime * 1000).toISOString() : new Date().toISOString(),
      dataSource: marketDataProvider.id,
      marketStatus,
      entryZone: { min: entryMin, max: entryMax },
      stopLoss,
      targetRange: { min: targetMin, max: targetMax }
    };
  }

  return {
    found: true as const,
    symbol,
    resolved,
    quote,
    candles,
    indicators,
    fundamentals,
    fundamentalsMeta: sourceMeta(marketDataProvider.id, fundamentals ? "LIVE" : "UNAVAILABLE"),
    quoteMeta: sourceMeta(marketDataProvider.id, decision.dataFreshness),
    sector: entry ? { key: entry.sectorKey, name: entry.sector } : null,
    sectorChangePct,
    news: news.map(({ analysis, ...n }) => ({ ...n, sentiment: analysis.sentiment, importance: analysis.importance })),
    attribution,
    decision,
    priceChangePct,
  };
}
