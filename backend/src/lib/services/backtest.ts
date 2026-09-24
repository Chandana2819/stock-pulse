import { prisma } from "../prisma";
import { computeIndicators } from "../indicators";
import { RecommendationEngine } from "./recommendationEngine";

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
};

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
  trades: Trade[];
};

async function getRealNiftyReturn(startDate: Date, endDate: Date): Promise<number | null> {
  const niftyPrices = await prisma.stockPrice.findMany({
    where: { symbol: "^NSEI", date: { gte: startDate, lte: endDate } },
    orderBy: { date: "asc" },
    select: { close: true },
  });
  if (niftyPrices.length < 2) return null;
  const first = niftyPrices[0].close;
  const last = niftyPrices[niftyPrices.length - 1].close;
  if (!first) return null;
  return Number((((last - first) / first) * 100).toFixed(2));
}

export async function runBacktest(options: {
  symbols: string[];
  startDate: Date;
  endDate: Date;
}): Promise<BacktestResult> {
  const trades: Trade[] = [];
  let buySignalsCount = 0;
  let sellSignalsCount = 0;

  for (const symbol of options.symbols) {
    const prices = await prisma.stockPrice.findMany({
      where: {
        symbol,
        date: { gte: options.startDate, lte: options.endDate },
      },
      orderBy: { date: "asc" },
    });

    if (prices.length < 35) continue;

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

  // Calculate Max Drawdown across a chronological, equal-weighted equity curve.
  // `trades` is grouped per-symbol (all of symbol A's trades, then symbol B's...),
  // not in time order, so walking it as-is and compounding full equity into each
  // trade would treat unrelated symbols' trade sequences as if they happened one
  // after another with 100% of capital re-staked every time — a single bad run
  // on one symbol could then crater "equity" for every symbol simulated after it.
  // Sorting chronologically and sizing each trade as a fixed slice of capital
  // (as if capital were split across several concurrent positions) models a
  // real multi-symbol strategy instead of one all-in serial bet.
  const CONCURRENT_POSITION_SLOTS = 20;
  const positionSize = 100000 / CONCURRENT_POSITION_SLOTS;
  const chronologicalTrades = [...trades].sort(
    (a, b) => (a.exitDate?.getTime() ?? 0) - (b.exitDate?.getTime() ?? 0)
  );

  let equity = 100000;
  let peakEquity = 100000;
  let maxDrawdown = 0;

  for (const t of chronologicalTrades) {
    equity += positionSize * ((t.returnPct ?? 0) / 100);
    if (equity > peakEquity) peakEquity = equity;
    const dd = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Real NIFTY 50 buy & hold return over the same window (null if index history doesn't cover it)
  const benchmarkReturn = await getRealNiftyReturn(options.startDate, options.endDate);

  return {
    totalTrades,
    buySignalsCount,
    sellSignalsCount,
    winRate,
    averageReturn,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    averageHoldingPeriod,
    benchmarkReturn,
    trades: trades.slice(0, 100), // Limit payload sizes
  };
}
