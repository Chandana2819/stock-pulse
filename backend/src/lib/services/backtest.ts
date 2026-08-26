import { prisma } from "../prisma";
import { computeIndicators } from "../indicators";
import { RecommendationEngine } from "./recommendationEngine";

type Trade = {
  symbol: string;
  entryDate: Date;
  entryPrice: number;
  exitDate: Date | null;
  exitPrice: number | null;
  returnPct: number | null;
  durationDays: number | null;
};

export type BacktestResult = {
  totalTrades: number;
  buySignalsCount: number;
  sellSignalsCount: number;
  winRate: number; // 0-100
  averageReturn: number; // %
  maxDrawdown: number; // %
  averageHoldingPeriod: number; // days
  benchmarkReturn: number; // % NIFTY 50 comparison proxy
  trades: Trade[];
};

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

      const decision = RecommendationEngine.generate({
        symbol,
        price: currentPrice,
        prevClose: prices[i - 1]?.close ?? null,
        indicators,
        fundamentals: null, // fundamentals excluded in backtest for stability
        sectorChangePct: null,
        marketRiskScore: 40, // default stable risk during backtest
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
            exitDate: null,
            exitPrice: null,
            returnPct: null,
            durationDays: null,
          };
        }
      } else if (decision.action.includes("SELL") || decision.action.includes("REDUCE")) {
        sellSignalsCount++;
        // Sell signal - Exit trade if holding
        if (activeTrade) {
          const ret = ((currentPrice - activeTrade.entryPrice) / activeTrade.entryPrice) * 100;
          const duration = Math.round((currentDate.getTime() - activeTrade.entryDate.getTime()) / (24 * 3600 * 1000));
          
          activeTrade.exitDate = currentDate;
          activeTrade.exitPrice = currentPrice;
          activeTrade.returnPct = Number(ret.toFixed(2));
          activeTrade.durationDays = duration;
          
          trades.push(activeTrade);
          activeTrade = null;
        }
      }
      
      // Auto exit check for risk limit rules (e.g. Stop Loss at -6% or Target profit at +15%)
      if (activeTrade) {
        const floatReturn = ((currentPrice - activeTrade.entryPrice) / activeTrade.entryPrice) * 100;
        if (floatReturn <= -6.0 || floatReturn >= 15.0) {
          const duration = Math.round((currentDate.getTime() - activeTrade.entryDate.getTime()) / (24 * 3600 * 1000));
          
          activeTrade.exitDate = currentDate;
          activeTrade.exitPrice = currentPrice;
          activeTrade.returnPct = Number(floatReturn.toFixed(2));
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
      const ret = ((finalPrice - activeTrade.entryPrice) / activeTrade.entryPrice) * 100;
      const duration = Math.round((finalDate.getTime() - activeTrade.entryDate.getTime()) / (24 * 3600 * 1000));

      activeTrade.exitDate = finalDate;
      activeTrade.exitPrice = finalPrice;
      activeTrade.returnPct = Number(ret.toFixed(2));
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

  // Calculate Max Drawdown from trade sequence
  let peakEquity = 100000; // start equity 1L
  let currentEquity = 100000;
  let maxDrawdown = 0;

  for (const t of trades) {
    const gain = currentEquity * ((t.returnPct ?? 0) / 100);
    currentEquity += gain;
    if (currentEquity > peakEquity) peakEquity = currentEquity;
    const dd = peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Estimate NIFTY 50 index benchmark return (assumes a general 11.5% annual return prorated)
  const totalDays = Math.round((options.endDate.getTime() - options.startDate.getTime()) / (24 * 3600 * 1000));
  const benchmarkReturn = Number(((totalDays / 365) * 11.5).toFixed(2));

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
