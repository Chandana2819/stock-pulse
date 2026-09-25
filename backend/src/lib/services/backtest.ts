import { prisma } from "../prisma";
import { computeIndicators } from "../indicators";
import { RecommendationEngine } from "./recommendationEngine";
import { marketDataProvider } from "../providers";

type Trade = {
  symbol: string;
  entryDate: Date;
  entryPrice: number;
  // The stop-loss / target the app actually recommended at entry (ATR-based,
  // from RecommendationEngine) — used for the auto-exit check below instead of
  // a generic fixed percentage, so the backtest measures the same exits a
  // trader following the app's own guidance would have taken.
  stopLossPrice: number | null;
  targetPrice: number | null;
  exitDate: Date | null;
  exitPrice: number | null;
  returnPct: number | null; // net of estimated transaction costs
  grossReturnPct: number | null; // before transaction costs, for transparency
  durationDays: number | null;
  exitReason: ExitReason | null;
};

export type ExitReason = "STOP_LOSS" | "TARGET" | "SELL_SIGNAL" | "WINDOW_END";

export type ExitBreakdown = Record<ExitReason, { count: number; winRatePct: number | null; avgReturnPct: number | null }>;

// Which exits are making or losing the money — tells us whether the model's
// problem is entries (stop-losses dominating), exits (SELL signals cutting
// winners early), or just costs, instead of guessing from one average.
export function computeExitBreakdown(trades: Pick<Trade, "exitReason" | "returnPct">[]): ExitBreakdown {
  const reasons: ExitReason[] = ["STOP_LOSS", "TARGET", "SELL_SIGNAL", "WINDOW_END"];
  const out = {} as ExitBreakdown;
  for (const reason of reasons) {
    const group = trades.filter((t) => t.exitReason === reason);
    const wins = group.filter((t) => (t.returnPct ?? 0) > 0).length;
    const sum = group.reduce((s, t) => s + (t.returnPct ?? 0), 0);
    out[reason] = {
      count: group.length,
      winRatePct: group.length > 0 ? Math.round((wins / group.length) * 100) : null,
      avgReturnPct: group.length > 0 ? Number((sum / group.length).toFixed(2)) : null,
    };
  }
  return out;
}

// Max drawdown of a realistic portfolio: capital split equally across every
// stock tested, each stock's slice trading only that stock's signals. The
// backtest holds at most one open trade per stock, so total exposure can
// never exceed 100% of capital. (The previous version sized every trade at a
// fixed 5% of capital regardless of how many were open at once — with ~75
// trades open simultaneously on average that was ~3-4x hidden leverage, which
// inflated the drawdown figure several times over.)
export function computeMaxDrawdown(
  trades: Pick<Trade, "exitDate" | "returnPct">[],
  symbolsEvaluated: number
): number {
  if (symbolsEvaluated <= 0 || trades.length === 0) return 0;
  const startingCapital = 100000;
  const slice = startingCapital / symbolsEvaluated;
  const chronological = [...trades].sort((a, b) => (a.exitDate?.getTime() ?? 0) - (b.exitDate?.getTime() ?? 0));
  let equity = startingCapital;
  let peak = startingCapital;
  let maxDd = 0;
  for (const t of chronological) {
    equity += slice * ((t.returnPct ?? 0) / 100);
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDd) maxDd = dd;
  }
  return Number(maxDd.toFixed(2));
}

// Estimated round-trip transaction cost for an NSE equity delivery trade via a
// zero-brokerage discount broker (Zerodha): STT 0.1% on both buy and sell,
// exchange transaction charges ~0.003% each side, stamp duty 0.015% on the buy
// side, SEBI charges + GST on fees adding a fraction more. This is what the
// old backtest omitted entirely, so its reported returns overstated what a
// trader would actually keep after real costs.
// Source: zerodha.com/charges (accessed 2026).
const ROUND_TRIP_COST_PCT = 0.22;

export function netReturnPct(entryPrice: number, exitPrice: number): { gross: number; net: number } {
  const gross = ((exitPrice - entryPrice) / entryPrice) * 100;
  return { gross: Number(gross.toFixed(2)), net: Number((gross - ROUND_TRIP_COST_PCT).toFixed(2)) };
}

// Whether an open position should be closed today, checked against the real
// stop-loss/target the app recommended at entry when both are known, falling
// back to a fixed -6%/+15% only in the defensive case where a level wasn't
// captured (e.g. ATR unavailable at entry).
export function checkExitTrigger(
  trade: { entryPrice: number; stopLossPrice: number | null; targetPrice: number | null },
  currentPrice: number
): boolean {
  const hasRealLevels = trade.stopLossPrice != null && trade.targetPrice != null;
  if (hasRealLevels) {
    return currentPrice <= (trade.stopLossPrice as number) || currentPrice >= (trade.targetPrice as number);
  }
  const floatReturn = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
  return floatReturn <= -6.0 || floatReturn >= 15.0;
}

export type BacktestResult = {
  totalTrades: number;
  buySignalsCount: number;
  sellSignalsCount: number;
  winRate: number; // 0-100
  averageReturn: number; // %
  maxDrawdown: number; // %
  averageHoldingPeriod: number; // days
  benchmarkReturn: number | null; // % real NIFTY 50 return over the same window, null if no index data covers it
  grossAverageReturn: number; // % per trade before transaction costs
  portfolioReturn: number; // % total return of the equal-weight portfolio drawdown is measured on — comparable to benchmarkReturn
  exitBreakdown: ExitBreakdown;
  trades: Trade[];
};

// The scanner never stores NIFTY's own daily history (it only reads NIFTY's
// live quote for the market-risk score), so the DB copy only exists if
// someone ran scratch/backfill_nifty.ts by hand — which is why the benchmark
// showed "—". Use the DB copy only when it genuinely spans the window;
// otherwise pull the real index history from the market-data provider.
const COVERAGE_TOLERANCE_MS = 10 * 24 * 3600 * 1000;

async function getRealNiftyReturn(startDate: Date, endDate: Date): Promise<number | null> {
  try {
    const niftyPrices = await prisma.stockPrice.findMany({
      where: { symbol: "^NSEI", date: { gte: startDate, lte: endDate } },
      orderBy: { date: "asc" },
      select: { close: true, date: true },
    });
    if (niftyPrices.length >= 2) {
      const firstRow = niftyPrices[0];
      const lastRow = niftyPrices[niftyPrices.length - 1];
      const coversWindow =
        firstRow.date.getTime() - startDate.getTime() <= COVERAGE_TOLERANCE_MS &&
        endDate.getTime() - lastRow.date.getTime() <= COVERAGE_TOLERANCE_MS;
      if (coversWindow && firstRow.close) {
        return Number((((lastRow.close - firstRow.close) / firstRow.close) * 100).toFixed(2));
      }
    }
  } catch {
    // fall through to the provider
  }

  try {
    const candles = await marketDataProvider.getCandles("^NSEI", "5Y");
    const startSec = startDate.getTime() / 1000;
    const endSec = endDate.getTime() / 1000;
    const inWindow = candles.filter((c) => c.time >= startSec && c.time <= endSec && c.close > 0);
    if (inWindow.length < 2) return null;
    const first = inWindow[0];
    const last = inWindow[inWindow.length - 1];
    if (first.time * 1000 - startDate.getTime() > COVERAGE_TOLERANCE_MS) return null;
    return Number((((last.close - first.close) / first.close) * 100).toFixed(2));
  } catch {
    return null;
  }
}

export async function runBacktest(options: {
  symbols: string[];
  startDate: Date;
  endDate: Date;
}): Promise<BacktestResult> {
  const trades: Trade[] = [];
  let buySignalsCount = 0;
  let sellSignalsCount = 0;
  let symbolsEvaluated = 0;

  for (const symbol of options.symbols) {
    const prices = await prisma.stockPrice.findMany({
      where: {
        symbol,
        date: { gte: options.startDate, lte: options.endDate },
      },
      orderBy: { date: "asc" },
    });

    if (prices.length < 35) continue;
    symbolsEvaluated++;

    let activeTrade: Trade | null = null;

    // Run historical simulation (avoiding look-ahead bias by only slicing up to index `i`)
    for (let i = 30; i < prices.length; i++) {
      const historicalSlice = prices.slice(0, i + 1);
      const currentPrice = prices[i].close;
      const currentDate = prices[i].date;

      // Extract candles for indicator computation
      const candles = historicalSlice.map((p) => ({
        time: Math.floor(p.date.getTime() / 1000),
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume,
      }));

      const indicators = computeIndicators(candles);

      // Known, honest limitations of this simulation — not oversights:
      //
      // fundamentals/news: we only ever have TODAY's fundamentals and news in
      // this database, not what they were on each historical date being
      // replayed. Feeding today's data into a scoring decision for a date years
      // ago would be look-ahead bias (the model "knowing" things it couldn't
      // have known at the time), which would make the backtest look better than
      // real trading ever could. Excluding them is the correct call given what
      // data is actually available — the trade-off is that this only backtests
      // the price/technical pillars, not the full model a live scan uses.
      //
      // marketRiskScore: real market risk (see marketRisk.ts) is built from FII/
      // DII flows, global markets, and breadth — none of which are archived
      // point-in-time here, only fetched live at scan time. A fixed 40 (mild/
      // moderate) means Rule B's elevated-risk override never fires in this
      // simulation, so the backtest doesn't reflect how the model behaves
      // during real high-risk periods (e.g. an actual market crash).
      const decision = RecommendationEngine.generate({
        symbol,
        price: currentPrice,
        prevClose: prices[i - 1]?.close ?? null,
        indicators,
        fundamentals: null,
        sectorChangePct: null,
        marketRiskScore: 40,
        candlesCount: historicalSlice.length,
        newsSentimentScore: null,
      });

      if (decision.action.includes("BUY")) {
        buySignalsCount++;
        // Buy signal - Enter trade if not already holding
        if (!activeTrade) {
          activeTrade = {
            symbol,
            entryDate: currentDate,
            entryPrice: currentPrice,
            stopLossPrice: decision.stopLoss ?? null,
            targetPrice: decision.targetRange?.min ?? null,
            exitDate: null,
            exitPrice: null,
            returnPct: null,
            grossReturnPct: null,
            durationDays: null,
            exitReason: null,
          };
        }
      } else if (decision.action.includes("SELL") || decision.action.includes("REDUCE")) {
        sellSignalsCount++;
        // Sell signal - Exit trade if holding
        if (activeTrade) {
          const { gross, net } = netReturnPct(activeTrade.entryPrice, currentPrice);
          const duration = Math.round((currentDate.getTime() - activeTrade.entryDate.getTime()) / (24 * 3600 * 1000));
          
          activeTrade.exitDate = currentDate;
          activeTrade.exitPrice = currentPrice;
          activeTrade.grossReturnPct = gross;
          activeTrade.returnPct = net;
          activeTrade.durationDays = duration;
          activeTrade.exitReason = "SELL_SIGNAL";
          
          trades.push(activeTrade);
          activeTrade = null;
        }
      }
      
      // Auto exit: the same stop-loss / target the app recommended when this
      // trade was opened (ATR-based — see RecommendationEngine), not a generic
      // fixed percentage. A trader following the app's own guidance would set
      // these levels at entry, so testing against them (instead of an arbitrary
      // -6%/+15%) measures how the app's actual advice would have performed.
      if (activeTrade) {
        if (checkExitTrigger(activeTrade, currentPrice)) {
          const { gross, net } = netReturnPct(activeTrade.entryPrice, currentPrice);
          const duration = Math.round((currentDate.getTime() - activeTrade.entryDate.getTime()) / (24 * 3600 * 1000));
          
          activeTrade.exitDate = currentDate;
          activeTrade.exitPrice = currentPrice;
          activeTrade.grossReturnPct = gross;
          activeTrade.returnPct = net;
          activeTrade.durationDays = duration;
          // Stop-loss always sits below entry and the target above it, so the
          // side of entry the exit happened on tells us which one fired.
          activeTrade.exitReason = currentPrice < activeTrade.entryPrice ? "STOP_LOSS" : "TARGET";
          
          trades.push(activeTrade);
          activeTrade = null;
        }
      }
    }

    // Force close active trade at end of backtest if still open
    if (activeTrade && prices.length > 0) {
      const finalPrice = prices[prices.length - 1].close;
      const finalDate = prices[prices.length - 1].date;
      const { gross, net } = netReturnPct(activeTrade.entryPrice, finalPrice);
      const duration = Math.round((finalDate.getTime() - activeTrade.entryDate.getTime()) / (24 * 3600 * 1000));

      activeTrade.exitDate = finalDate;
      activeTrade.exitPrice = finalPrice;
      activeTrade.grossReturnPct = gross;
      activeTrade.returnPct = net;
      activeTrade.durationDays = duration;
      activeTrade.exitReason = "WINDOW_END";

      trades.push(activeTrade);
    }
  }

  // Calculate Aggregated Performance Metrics
  const totalTrades = trades.length;
  const winningTrades = trades.filter((t) => (t.returnPct ?? 0) > 0);
  const winRate = totalTrades > 0 ? Math.round((winningTrades.length / totalTrades) * 100) : 0;
  
  const sumReturns = trades.reduce((sum, t) => sum + (t.returnPct ?? 0), 0);
  const averageReturn = totalTrades > 0 ? Number((sumReturns / totalTrades).toFixed(2)) : 0;

  const sumHoldDays = trades.reduce((sum, t) => sum + (t.durationDays ?? 0), 0);
  const averageHoldingPeriod = totalTrades > 0 ? Math.round(sumHoldDays / totalTrades) : 0;

  const maxDrawdown = computeMaxDrawdown(trades, symbolsEvaluated);

  const grossSum = trades.reduce((sum, t) => sum + (t.grossReturnPct ?? 0), 0);
  const grossAverageReturn = totalTrades > 0 ? Number((grossSum / totalTrades).toFixed(2)) : 0;

  // Total return of the same equal-weight portfolio (each stock's slice of
  // capital, trading only its own signals) — the like-for-like number to
  // put next to NIFTY buy & hold. Average-per-trade can't be compared to an
  // index return directly.
  const portfolioReturn =
    symbolsEvaluated > 0 ? Number((trades.reduce((s, t) => s + (t.returnPct ?? 0), 0) / symbolsEvaluated).toFixed(2)) : 0;

  // Real NIFTY 50 buy & hold return over the same window (null if index history doesn't cover it)
  const benchmarkReturn = await getRealNiftyReturn(options.startDate, options.endDate);

  return {
    totalTrades,
    buySignalsCount,
    sellSignalsCount,
    winRate,
    averageReturn,
    maxDrawdown,
    averageHoldingPeriod,
    benchmarkReturn,
    grossAverageReturn,
    portfolioReturn,
    exitBreakdown: computeExitBreakdown(trades),
    trades: trades.slice(0, 100), // Limit payload sizes
  };
}
