import { describe, it, expect } from "vitest";
import { netReturnPct, checkExitTrigger } from "./backtest";

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
