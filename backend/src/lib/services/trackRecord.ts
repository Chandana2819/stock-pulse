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

const BACKTEST_CACHE_KEY = "track-record:backtested:v2";
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

// The full-universe replay takes minutes on a cold cache (215 stocks x ~500
// trading days, indicators recomputed each day). It used to run inside the
// HTTP request: the page sat on "Loading track record..." for the whole
// computation, and every refresh during that time started ANOTHER full
// replay in parallel, slowing all of them down. Now it runs once in the
// background (concurrent callers share the same in-flight run), the request
// returns immediately, and the last good result is kept for a week so an
// expired cache shows the previous numbers while fresh ones compute.
const BACKTEST_LAST_GOOD_KEY = `${BACKTEST_CACHE_KEY}:last-good`;
const BACKTEST_LAST_GOOD_TTL = 7 * 24 * 3600 * 1000;
let backtestInFlight: Promise<BacktestedTrackRecord> | null = null;

async function computeBacktestedTrackRecord(): Promise<BacktestedTrackRecord> {
  const symbols = UNIVERSE.filter((u) => u.exchange === "NSE").map((u) => u.symbol);
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - BACKTEST_WINDOW_DAYS * 24 * 3600 * 1000);
  const result = await runBacktest({ symbols, startDate, endDate });
  return {
    ...result,
    symbolsCovered: symbols.length,
    windowLabel: "Last 2 years",
    computedAt: new Date().toISOString(),
  };
}

function startBacktestComputation(): Promise<BacktestedTrackRecord> {
  if (!backtestInFlight) {
    const started = Date.now();
    backtestInFlight = computeBacktestedTrackRecord()
      .then(async (record) => {
        await cache.set(BACKTEST_CACHE_KEY, record, TTL.trackRecord);
        await cache.set(BACKTEST_LAST_GOOD_KEY, record, BACKTEST_LAST_GOOD_TTL);
        console.log(`[track-record] Historical replay computed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
        return record;
      })
      .finally(() => {
        backtestInFlight = null;
      });
    backtestInFlight.catch((err) => console.error("[track-record] Historical replay failed:", err));
  }
  return backtestInFlight;
}

export async function getBacktestedTrackRecord(): Promise<{ value: BacktestedTrackRecord | null; computing: boolean; stale: boolean }> {
  const fresh = await cache.get<BacktestedTrackRecord>(BACKTEST_CACHE_KEY);
  if (fresh) return { value: fresh, computing: false, stale: false };
  void startBacktestComputation();
  const lastGood = await cache.get<BacktestedTrackRecord>(BACKTEST_LAST_GOOD_KEY);
  return { value: lastGood ?? null, computing: true, stale: lastGood != null };
}

/** Kick off the replay in the background so the first visitor after a deploy doesn't wait for it. */
export function warmBacktestedTrackRecord(): void {
  void startBacktestComputation().catch(() => {});
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

// Per-symbol signal history: the same "did it work?" methodology as the
// aggregate live track record above (RecommendationHistory checked against
// real StockPrice closes, one signal per symbol per calendar day), but
// returning every individual dated call for one stock instead of a single
// rolled-up percentage. This is what answers "what did it tell me to do a
// week/month ago for this stock, and did that pan out" — the aggregate
// track record can't show that, only a per-symbol breakdown can.
export type SymbolSignalHistoryEntry = {
  date: string; // YYYY-MM-DD, the calendar day the signal was issued
  action: string;
  score: number;
  confidence: number;
  entryPrice: number | null;
  horizons: {
    d5: SignalHorizonResult;
    d10: SignalHorizonResult;
    d20: SignalHorizonResult;
  };
};

export type SignalHorizonResult = {
  price: number | null;
  returnPct: number | null;
  result: "WIN" | "LOSS" | "STABLE" | "UNSTABLE" | "PENDING" | "NOT_SCORED";
};

export type SymbolSignalHistory = {
  symbol: string;
  windowDays: number;
  entries: SymbolSignalHistoryEntry[];
  summary: {
    totalSignals: number;
    scored: { d5: number; d10: number; d20: number };
    accuracyPct: { d5: number | null; d10: number | null; d20: number | null };
  };
};

export function classifyHorizonResult(
  bucket: "BUY" | "SELL" | "HOLD" | "WAIT",
  entryPrice: number,
  futurePrice: number | undefined
): SignalHorizonResult {
  if (bucket === "WAIT") return { price: null, returnPct: null, result: "NOT_SCORED" };
  if (futurePrice == null) return { price: null, returnPct: null, result: "PENDING" };
  const returnPct = Number((((futurePrice - entryPrice) / entryPrice) * 100).toFixed(2));
  let result: SignalHorizonResult["result"];
  if (bucket === "BUY") result = returnPct > 0 ? "WIN" : "LOSS";
  else if (bucket === "SELL") result = returnPct < 0 ? "WIN" : "LOSS";
  else result = Math.abs(returnPct) <= 3 ? "STABLE" : "UNSTABLE";
  return { price: futurePrice, returnPct, result };
}

export async function getSymbolSignalHistory(symbol: string, windowDays = 180): Promise<SymbolSignalHistory> {
  const since = new Date(Date.now() - windowDays * 24 * 3600 * 1000);

  const rows = await prisma.recommendationHistory.findMany({
    where: { symbol, generatedAt: { gte: since } },
    orderBy: { generatedAt: "asc" },
    select: { action: true, score: true, confidence: true, generatedAt: true },
  });

  // Collapse to one signal per calendar day, same rule as the aggregate view.
  const dailySignals = new Map<string, { action: string; score: number; confidence: number; date: Date }>();
  for (const r of rows) {
    const dayKey = r.generatedAt.toISOString().slice(0, 10);
    if (!dailySignals.has(dayKey)) {
      dailySignals.set(dayKey, { action: r.action, score: r.score, confidence: r.confidence, date: r.generatedAt });
    }
  }
  const signals = Array.from(dailySignals.values()).sort((a, b) => b.date.getTime() - a.date.getTime());

  if (signals.length === 0) {
    return {
      symbol,
      windowDays,
      entries: [],
      summary: { totalSignals: 0, scored: { d5: 0, d10: 0, d20: 0 }, accuracyPct: { d5: null, d10: null, d20: null } },
    };
  }

  const earliestSignalDate = signals[signals.length - 1].date;
  const prices = await prisma.stockPrice.findMany({
    where: { symbol, date: { gte: earliestSignalDate } },
    orderBy: { date: "asc" },
    select: { date: true, close: true },
  });

  let scored5 = 0, wins5 = 0, scored10 = 0, wins10 = 0, scored20 = 0, wins20 = 0;

  const entries: SymbolSignalHistoryEntry[] = signals.map((sig) => {
    const bucket = directionBucket(sig.action);

    let entryIdx = -1;
    for (let i = 0; i < prices.length; i++) {
      if (prices[i].date.getTime() <= sig.date.getTime()) entryIdx = i;
      else break;
    }
    const entryPrice = entryIdx >= 0 ? prices[entryIdx].close : null;

    const at = (offset: number): number | undefined => {
      const idx = entryIdx + offset;
      return idx >= 0 && idx < prices.length ? prices[idx].close ?? undefined : undefined;
    };

    const d5 = entryPrice != null ? classifyHorizonResult(bucket, entryPrice, at(5)) : { price: null, returnPct: null, result: "PENDING" as const };
    const d10 = entryPrice != null ? classifyHorizonResult(bucket, entryPrice, at(10)) : { price: null, returnPct: null, result: "PENDING" as const };
    const d20 = entryPrice != null ? classifyHorizonResult(bucket, entryPrice, at(20)) : { price: null, returnPct: null, result: "PENDING" as const };

    if (d5.result === "WIN" || d5.result === "LOSS") { scored5++; if (d5.result === "WIN") wins5++; }
    if (d10.result === "WIN" || d10.result === "LOSS") { scored10++; if (d10.result === "WIN") wins10++; }
    if (d20.result === "WIN" || d20.result === "LOSS") { scored20++; if (d20.result === "WIN") wins20++; }

    return {
      date: sig.date.toISOString().slice(0, 10),
      action: sig.action,
      score: sig.score,
      confidence: sig.confidence,
      entryPrice,
      horizons: { d5, d10, d20 },
    };
  });

  return {
    symbol,
    windowDays,
    entries,
    summary: {
      totalSignals: entries.length,
      scored: { d5: scored5, d10: scored10, d20: scored20 },
      accuracyPct: {
        d5: scored5 > 0 ? Math.round((wins5 / scored5) * 100) : null,
        d10: scored10 > 0 ? Math.round((wins10 / scored10) * 100) : null,
        d20: scored20 > 0 ? Math.round((wins20 / scored20) * 100) : null,
      },
    },
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
