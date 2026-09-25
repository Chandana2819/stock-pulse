import { describe, it, expect } from "vitest";
import { netReturnPct, checkExitTrigger, computeMaxDrawdown, computeExitBreakdown } from "./backtest";

describe("netReturnPct", () => {
  it("computes gross return with no cost adjustment", () => {
    const { gross } = netReturnPct(100, 110);
    expect(gross).toBe(10);
  });

  it("subtracts the round-trip transaction cost from the gross return", () => {
    const { gross, net } = netReturnPct(100, 110);
    expect(net).toBe(Number((gross - 0.22).toFixed(2)));
    expect(net).toBeLessThan(gross);
  });

  it("can turn a small gross gain into a net loss once costs are applied", () => {
    // A trade that "won" by a hair before costs is exactly the case the old
    // cost-free backtest got wrong — it would have counted this as a winning
    // trade when a real trader would have lost money after fees.
    const { gross, net } = netReturnPct(100, 100.1); // +0.1% gross
    expect(gross).toBeGreaterThan(0);
    expect(net).toBeLessThan(0);
  });

  it("makes a loss slightly worse after costs", () => {
    const { net } = netReturnPct(100, 95);
    expect(net).toBe(-5.22);
  });
});

describe("checkExitTrigger", () => {
  const trade = { entryPrice: 100, stopLossPrice: 90, targetPrice: 115 };

  it("does not trigger while price is between the real stop-loss and target", () => {
    expect(checkExitTrigger(trade, 105)).toBe(false);
  });

  it("triggers at or below the real stop-loss price", () => {
    expect(checkExitTrigger(trade, 90)).toBe(true);
    expect(checkExitTrigger(trade, 85)).toBe(true);
  });

  it("triggers at or above the real target price", () => {
    expect(checkExitTrigger(trade, 115)).toBe(true);
    expect(checkExitTrigger(trade, 120)).toBe(true);
  });

  it("does not use the generic fixed -6%/+15% thresholds when real levels are known", () => {
    // entryPrice 100, real stop-loss at 90 (-10%) — under the old fixed-%
    // logic this would still be within the -6% band and wouldn't fire yet.
    // With real per-stock levels, a -10% stop-loss placed by the app itself
    // should NOT be second-guessed by a generic -6% rule.
    expect(checkExitTrigger(trade, 92)).toBe(false); // -8%, inside the real -10% stop
    expect(checkExitTrigger(trade, 89)).toBe(true); // below the real -10% stop
  });

  it("falls back to the fixed -6%/+15% thresholds when a real level is missing", () => {
    const noLevels = { entryPrice: 100, stopLossPrice: null, targetPrice: null };
    expect(checkExitTrigger(noLevels, 94)).toBe(true); // -6%
    expect(checkExitTrigger(noLevels, 95)).toBe(false); // -5%, inside the fallback band
    expect(checkExitTrigger(noLevels, 115)).toBe(true); // +15%
  });
});

describe("computeMaxDrawdown", () => {
  const d = (day: number) => new Date(Date.UTC(2025, 0, day));

  it("sizes each trade as one stock's slice of capital, so exposure never exceeds 100%", () => {
    // 100 stocks tested, 10 simultaneous -10% losses: 10 slices x 1% of capital x -10% = -1% total
    const trades = Array.from({ length: 10 }, () => ({ exitDate: d(5), returnPct: -10 }));
    expect(computeMaxDrawdown(trades, 100)).toBe(1);
  });

  it("does not inflate drawdown with hidden leverage when many trades overlap", () => {
    // Old sizing (fixed 5% per trade regardless of count) would call this a 50% drawdown
    const trades = Array.from({ length: 100 }, () => ({ exitDate: d(5), returnPct: -10 }));
    expect(computeMaxDrawdown(trades, 200)).toBe(5);
  });

  it("measures drawdown from the running peak, in exit-date order", () => {
    const trades = [
      { exitDate: d(3), returnPct: -20 }, // listed first but happens after the gain
      { exitDate: d(1), returnPct: 20 },
    ];
    // 2 slices of 50k: +10k -> 110k peak, then -10k -> 100k => 9.09% drawdown
    expect(computeMaxDrawdown(trades, 2)).toBe(9.09);
  });

  it("returns 0 with no trades or no stocks evaluated", () => {
    expect(computeMaxDrawdown([], 10)).toBe(0);
    expect(computeMaxDrawdown([{ exitDate: d(1), returnPct: -5 }], 0)).toBe(0);
  });
});

describe("computeExitBreakdown", () => {
  it("groups trades by exit reason with win rate and average return", () => {
    const b = computeExitBreakdown([
      { exitReason: "STOP_LOSS", returnPct: -5 },
      { exitReason: "STOP_LOSS", returnPct: -3 },
      { exitReason: "TARGET", returnPct: 8 },
      { exitReason: "SELL_SIGNAL", returnPct: 2 },
      { exitReason: "SELL_SIGNAL", returnPct: -1 },
    ]);
    expect(b.STOP_LOSS).toEqual({ count: 2, winRatePct: 0, avgReturnPct: -4 });
    expect(b.TARGET).toEqual({ count: 1, winRatePct: 100, avgReturnPct: 8 });
    expect(b.SELL_SIGNAL).toEqual({ count: 2, winRatePct: 50, avgReturnPct: 0.5 });
    expect(b.WINDOW_END).toEqual({ count: 0, winRatePct: null, avgReturnPct: null });
  });
});
