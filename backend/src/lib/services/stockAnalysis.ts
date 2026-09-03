// Aggregates everything needed to fully describe one stock: quote,
// candles/indicators, fundamentals, sector context, recent news with
// sentiment, the "why is it moving" attribution, and the explainable decision.
// Both the legacy /api/analyze endpoint and the new /api/stocks/:symbol
// endpoint are thin wrappers around this so the two never drift apart.

import { marketDataProvider, newsProvider, resolveStockQuote } from "../providers";
import { computeIndicators, pctChange } from "../indicators";
import { analyzeHeadline } from "../engine/sentiment";
import { explainMove } from "../engine/whyMoving";
import { computeDecision, type DecisionInput, type SignalAction } from "../engine/decision";
import { getSectorChangeForKey } from "./market";
import { lookupUniverse } from "../universe";
import { sourceMeta } from "../http";
import { prisma } from "../prisma";

// Groups signals that mean "the same call" for continuity purposes — e.g. a
// symbol flipping from BUY to STRONG BUY isn't a new call, just a stronger
// read of the same one.
function directionBucket(action: string): "BUY" | "SELL" | "HOLD" | "WAIT" {
  if (action.includes("BUY")) return "BUY";
  if (action.includes("SELL") || action === "REDUCE") return "SELL";
  if (action === "HOLD") return "HOLD";
  return "WAIT";
}

// Real, computed "how long has this call been active" — walks the actual
// scan history (logged every 4h by the market scanner) backward from now,
// counting consecutive rows in the same direction bucket as the current
// signal. Not a forecast — a historical fact about this exact symbol.
export async function getSignalActiveSince(symbol: string, currentSignal: SignalAction): Promise<{ activeSinceDate: string; activeDays: number } | null> {
  const rows = await prisma.recommendationHistory.findMany({
    where: { symbol },
    orderBy: { generatedAt: "desc" },
    take: 60,
  }).catch(() => []);

  if (rows.length === 0) return null;

  const targetBucket = directionBucket(currentSignal);
  let streakStart = rows[0].generatedAt;
  for (const row of rows) {
    if (directionBucket(row.action) !== targetBucket) break;
    streakStart = row.generatedAt;
  }

  const activeDays = Math.max(0, Math.floor((Date.now() - streakStart.getTime()) / (24 * 3600 * 1000)));
  return { activeSinceDate: streakStart.toISOString().slice(0, 10), activeDays };
}

export type SignalTrend = {
  sampleSize: number;
  scoreDaysAgo: number | null;
  scoreDelta: number | null;
  flips: number;
  flipSummary: string;
};

// Real historical read on a symbol's own signal, from the actual scan log —
// how many times has the call flipped recently, and where was the score a
// week ago. This is the "previous data" the assistant grounds itself in;
// nothing here is a forecast, only a record of what already happened.
export async function getRecentSignalTrend(symbol: string, currentScore: number): Promise<SignalTrend | null> {
  const rows = await prisma.recommendationHistory.findMany({
    where: { symbol },
    orderBy: { generatedAt: "desc" },
    take: 60,
  }).catch(() => []);

  if (rows.length < 2) return null;

  const weekAgoMs = Date.now() - 7 * 24 * 3600 * 1000;
  const weekAgoRow = rows.find((r) => r.generatedAt.getTime() <= weekAgoMs) ?? rows[rows.length - 1];
  const scoreDaysAgo = weekAgoRow.score;
  const scoreDelta = currentScore - scoreDaysAgo;

  let flips = 0;
  for (let i = 1; i < rows.length; i++) {
    if (directionBucket(rows[i - 1].action) !== directionBucket(rows[i].action)) flips++;
  }

  const flipSummary =
    flips === 0
      ? "held a consistent call"
      : `changed direction ${flips} time${flips === 1 ? "" : "s"}`;

  return { sampleSize: rows.length, scoreDaysAgo, scoreDelta, flips, flipSummary };
}

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
    // 5 years of daily candles — not just for the chart's short-range views,
    // but so long-lookback indicators like SMA200 (see indicators.ts) can
    // actually compute instead of always returning null on a 6-month window.
    marketDataProvider.getCandles(symbol, "5Y"),
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

  const newsArticlesForPillar = relevantNews.map(n => ({
    title: n.title,
    sentiment: n.analysis.sentiment as "POSITIVE" | "NEUTRAL" | "NEGATIVE",
    sentimentScore: n.analysis.sentimentScore
  }));

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
    symbol,
    price: quote.price,
    fundamentals,
    indicators,
    priceChangePct,
    marketRiskScore: opts.marketRiskScore ?? null,
    sectorChangePct,
    newsArticles: newsArticlesForPillar,
    volatility30d: indicators?.volatility30d ?? null,
    avgVolume: quote.avgVolume,
    volume: quote.volume,
    ownedQuantity: opts.ownedQuantity ?? 0,
    candlesCount: candles.length,
  };

  let decision: any;

  if (validationFailed) {
    decision = {
      symbol,
      signal: "WAIT" as const,
      confidence: 0,
      scores: { trend: 0, momentum: 0, volume: 0, fundamentals: 0, sentiment: 0, risk: 0, marketSector: 0, final: 0 },
      pillars: [],
      reasons: [validationReason],
      warnings: [validationReason],
      mainRisk: validationReason,
      wouldChange: [],
      validationFailed: true,
      validationReason,
      riskLevel: "MODERATE" as const,
      dataQuality: "INSUFFICIENT" as const,
      dataQualityScore: 0,
      dataFreshness: "STALE" as const,
      dataTimestamp: quote.quoteTime ? new Date(quote.quoteTime * 1000).toISOString() : new Date().toISOString(),
      dataSource: marketDataProvider.id,
      marketStatus: "CLOSED" as const,
      entryZone: { min: 0, max: 0 },
      stopLoss: 0,
      targetRange: { min: 0, max: 0 },
      activeSince: null,
    };
  } else {
    const calculatedDecision = computeDecision(decisionInput);
    const activeSince = await getSignalActiveSince(symbol, calculatedDecision.signal);

    // Calculate Entry Zone, Stop-Loss, and Target Range
    const price = quote.price;
    const atrVal = indicators?.atr14 ?? (price * 0.025); // Fallback to 2.5% ATR
    const stopLoss = Number((price - 2 * atrVal).toFixed(2));
    const entryMin = Number((price - 0.015 * price).toFixed(2));
    const entryMax = Number((price + 0.005 * price).toFixed(2));
    const targetMin = Number((price + 0.08 * price).toFixed(2));
    const targetMax = Number((price + 0.15 * price).toFixed(2));

    // Calculate Risk Level (LOW, MODERATE, HIGH, VERY HIGH)
    let riskLevel: "LOW" | "MODERATE" | "HIGH" | "VERY HIGH" = "MODERATE";
    if (calculatedDecision.scores.risk >= 70) riskLevel = "LOW";
    else if (calculatedDecision.scores.risk >= 50) riskLevel = "MODERATE";
    else if (calculatedDecision.scores.risk >= 30) riskLevel = "HIGH";
    else riskLevel = "VERY HIGH";

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
      decision: calculatedDecision.signal,
      action: calculatedDecision.signal,
      score: calculatedDecision.scores.final,
      finalScore: calculatedDecision.scores.final,
      totalScore: calculatedDecision.scores.final,
      validationFailed: false,
      validationReason: "",
      riskLevel,
      dataFreshness,
      dataTimestamp: quote.quoteTime ? new Date(quote.quoteTime * 1000).toISOString() : new Date().toISOString(),
      dataSource: marketDataProvider.id,
      marketStatus,
      entryZone: { min: entryMin, max: entryMax },
      stopLoss,
      targetRange: { min: targetMin, max: targetMax },
      activeSince,
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
