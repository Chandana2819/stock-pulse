import { describe, it, expect } from "vitest";
import { classifyHorizonResult } from "./trackRecord";

describe("classifyHorizonResult", () => {
  it("WAIT signals are never scored — not directional, no target to hit or miss", () => {
    const r = classifyHorizonResult("WAIT", 100, 110);
    expect(r).toEqual({ price: null, returnPct: null, result: "NOT_SCORED" });
  });

  it("returns PENDING when the future price isn't available yet (horizon hasn't elapsed)", () => {
    const r = classifyHorizonResult("BUY", 100, undefined);
    expect(r.result).toBe("PENDING");
    expect(r.price).toBeNull();
  });

  it("BUY wins when price rose", () => {
    const r = classifyHorizonResult("BUY", 100, 108);
    expect(r.result).toBe("WIN");
    expect(r.returnPct).toBe(8);
  });

  it("BUY loses when price fell", () => {
    const r = classifyHorizonResult("BUY", 100, 92);
    expect(r.result).toBe("LOSS");
    expect(r.returnPct).toBe(-8);
  });

  it("SELL wins when price fell (correctly called the decline)", () => {
    const r = classifyHorizonResult("SELL", 100, 90);
    expect(r.result).toBe("WIN");
  });

  it("SELL loses when price rose (missed call — stock went up after a sell signal)", () => {
    const r = classifyHorizonResult("SELL", 100, 105);
    expect(r.result).toBe("LOSS");
  });

  it("HOLD is STABLE within +/-3%", () => {
    expect(classifyHorizonResult("HOLD", 100, 102).result).toBe("STABLE");
    expect(classifyHorizonResult("HOLD", 100, 98).result).toBe("STABLE");
  });

  it("HOLD is UNSTABLE outside +/-3% (the stock actually moved a lot despite a hold call)", () => {
    expect(classifyHorizonResult("HOLD", 100, 105).result).toBe("UNSTABLE");
    expect(classifyHorizonResult("HOLD", 100, 95).result).toBe("UNSTABLE");
  });

  it("a flat 0% move is a BUY loss, not a win — no false credit for going nowhere", () => {
    expect(classifyHorizonResult("BUY", 100, 100).result).toBe("LOSS");
  });
});
