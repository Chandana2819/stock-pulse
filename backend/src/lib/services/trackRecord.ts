// Track record: an honest accuracy scorecard for the recommendation engine.
//
// Two independent measurements, both grounded in real data — never a fabricated
// win rate:
//   - "backtested": the decision engine replayed day-by-day over real historical
//     prices across the NSE universe (see backtest.ts), compared to the real
//     NIFTY 50 buy & hold return over the same window.
//   - "live": actual signals the running scanner logged (RecommendationHistory),
//     checked against what the stock's price actually did afterward. Sample
//     size grows as the scanner keeps running — it will be small early on and
//     that is reported explicitly rather than hidden.
import { prisma } from "../prisma";
import { cache, TTL } from "../cache";
import { runBacktest, type BacktestResult } from "./backtest";
import { UNIVERSE } from "../universe";

const BACKTEST_CACHE_KEY = "track-record:backtested:v1";
const BACKTEST_WINDOW_DAYS = 730;
const LIVE_FORWARD_TRADING_DAYS = 5;

function directionBucket(action: string): "BUY" | "SELL" | "HOLD" | "WAIT" {
  if (action.includes("BUY")) return "BUY";
  if (action.includes("SELL") || action === "REDUCE") return "SELL";
  if (action === "HOLD") return "HOLD";
  return "WAIT";
}

export type BacktestedTrackRecord = BacktestResult & {
  symbolsCovered: number;
  windowLabel: string;
  computedAt: string;
};

export async function getBacktestedTrackRecord(): Promise<{ value: BacktestedTrackRecord; cacheHit: boolean; stale: boolean }> {
  const { value, hit, stale } = await cache.wrap(BACKTEST_CACHE_KEY, TTL.trackRecord, async () => {
    const symbols = UNIVERSE.filter((u) => u.exchange === "NSE").map((u) => u.symbol);
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - BACKTEST_WINDOW_DAYS * 24 * 3600 * 1000);
    const result = await runBacktest({ symbols, startDate, endDate });
    const record: BacktestedTrackRecord = {
      ...result,
      symbolsCovered: symbols.length,
      windowLabel: "Last 2 years",
      computedAt: new Date().toISOString(),
    };
    return record;
  });
  return { value, cacheHit: hit, stale };
}

export type LiveTrackRecord = {
  totalSignalsIssued: number;
  scoredSignals: number;
  awaitingWindow: number;
  abstentions: number; // WAIT calls — not directional, not scored
  windowTradingDays: number;
  oldestSignalDate: string | null;
  newestScoredDate: string | null;
  directionalAccuracyPct: number | null;
  buy: { sampleSize: number; accuracyPct: number | null; avgReturnPct: number | null };
  sell: { sampleSize: number; accuracyPct: number | null; avgReturnPct: number | null };
  hold: { sampleSize: number; stabilityPct: number | null };
};

function emptyLiveTrackRecord(): LiveTrackRecord {
  return {
    totalSignalsIssued: 0,
    scoredSignals: 0,
    awaitingWindow: 0,
    abstentions: 0,
    windowTradingDays: LIVE_FORWARD_TRADING_DAYS,
    oldestSignalDate: null,
    newestScoredDate: null,
    directionalAccuracyPct: null,
    buy: { sampleSize: 0, accuracyPct: null, avgReturnPct: null },
    sell: { sampleSize: 0, accuracyPct: null, avgReturnPct: null },
    hold: { sampleSize: 0, stabilityPct: null },
  };
}

const LIVE_CACHE_KEY = "track-record:live:v1";

export async function getLiveTrackRecord(): Promise<{ value: LiveTrackRecord; cacheHit: boolean; stale: boolean }> {
  const { value, hit, stale } = await cache.wrap(LIVE_CACHE_KEY, TTL.trackRecord, computeLiveTrackRecord);
  return { value, cacheHit: hit, stale };
}

async function computeLiveTrackRecord(): Promise<LiveTrackRecord> {
  const rows = await prisma.recommendationHistory.findMany({
    where: { symbol: { endsWith: ".NS" } },
    orderBy: { generatedAt: "asc" },
    select: { symbol: true, action: true, generatedAt: true },
  });
  if (rows.length === 0) return emptyLiveTrackRecord();

  // Collapse to one signal per symbol per calendar day — the scanner logs every
  // ~4h, and re-scoring the same call several times a day would inflate the
  // sample without adding information.
  const dailySignals = new Map<string, { symbol: string; action: string; date: Date }>();
  for (const r of rows) {
    const dayKey = `${r.symbol}|${r.generatedAt.toISOString().slice(0, 10)}`;
    if (!dailySignals.has(dayKey)) {
      dailySignals.set(dayKey, { symbol: r.symbol, action: r.action, date: r.generatedAt });
    }
  }

  const bySymbol = new Map<string, { action: string; date: Date }[]>();
  for (const sig of dailySignals.values()) {
    if (!bySymbol.has(sig.symbol)) bySymbol.set(sig.symbol, []);
    bySymbol.get(sig.symbol)!.push({ action: sig.action, date: sig.date });
  }

  let buyTotal = 0, buyWins = 0, buyReturnSum = 0;
  let sellTotal = 0, sellWins = 0, sellReturnSum = 0;
  let holdTotal = 0, holdStable = 0;
  let abstentions = 0;
  let awaitingWindow = 0;
  let oldest: Date | null = null;
  let newestScored: Date | null = null;

  for (const [symbol, signals] of bySymbol) {
    const earliestSignalDate = signals.reduce((min, s) => (s.date < min ? s.date : min), signals[0].date);
    const prices = await prisma.stockPrice.findMany({
      where: { symbol, date: { gte: earliestSignalDate } },
      orderBy: { date: "asc" },
      select: { date: true, close: true },
    });

    for (const sig of signals) {
      if (oldest === null || sig.date < oldest) oldest = sig.date;

      const bucket = directionBucket(sig.action);
      if (bucket === "WAIT") {
        abstentions++;
        continue;
      }

      let entryIdx = -1;
      for (let i = 0; i < prices.length; i++) {
        if (prices[i].date.getTime() <= sig.date.getTime()) entryIdx = i;
        else break;
      }
      const exitIdx = entryIdx + LIVE_FORWARD_TRADING_DAYS;
      if (entryIdx === -1 || exitIdx >= prices.length) {
        awaitingWindow++;
        continue;
      }

      const entryPrice = prices[entryIdx].close;
      const exitPrice = prices[exitIdx].close;
      if (!entryPrice) {
        awaitingWindow++;
        continue;
      }
      const returnPct = ((exitPrice - entryPrice) / entryPrice) * 100;
      const exitDate = prices[exitIdx].date;
      if (newestScored === null || exitDate > newestScored) newestScored = exitDate;

      if (bucket === "BUY") {
        buyTotal++;
        buyReturnSum += returnPct;
        if (returnPct > 0) buyWins++;
      } else if (bucket === "SELL") {
        sellTotal++;
        sellReturnSum += returnPct;
        if (returnPct < 0) sellWins++;
      } else {
        holdTotal++;
        if (Math.abs(returnPct) <= 3) holdStable++;
      }
    }
  }

  const directionalTotal = buyTotal + sellTotal;
  const directionalWins = buyWins + sellWins;
  const scoredSignals = buyTotal + sellTotal + holdTotal;

  return {
    totalSignalsIssued: dailySignals.size,
    scoredSignals,
    awaitingWindow,
    abstentions,
    windowTradingDays: LIVE_FORWARD_TRADING_DAYS,
    oldestSignalDate: oldest ? oldest.toISOString().slice(0, 10) : null,
    newestScoredDate: newestScored ? newestScored.toISOString().slice(0, 10) : null,
    directionalAccuracyPct: directionalTotal > 0 ? Math.round((directionalWins / directionalTotal) * 100) : null,
    buy: {
      sampleSize: buyTotal,
      accuracyPct: buyTotal > 0 ? Math.round((buyWins / buyTotal) * 100) : null,
      avgReturnPct: buyTotal > 0 ? Number((buyReturnSum / buyTotal).toFixed(2)) : null,
    },
    sell: {
      sampleSize: sellTotal,
      accuracyPct: sellTotal > 0 ? Math.round((sellWins / sellTotal) * 100) : null,
      avgReturnPct: sellTotal > 0 ? Number((sellReturnSum / sellTotal).toFixed(2)) : null,
    },
    hold: {
      sampleSize: holdTotal,
      stabilityPct: holdTotal > 0 ? Math.round((holdStable / holdTotal) * 100) : null,
    },
  };
}
