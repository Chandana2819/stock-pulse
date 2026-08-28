// Technical indicator maths. Pure functions over close/OHLC arrays so they can
// be unit-tested and reused by the scoring engine, alerts and the chart API.

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number };

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    if (prev == null) {
      prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

/** Wilder-smoothed RSI. Returns null for the warm-up window. */
export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9) {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const line = values.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? (emaFast[i] as number) - (emaSlow[i] as number) : null
  );
  const defined = line.map((x) => x ?? 0);
  const signalRaw = ema(defined, signalPeriod);
  const signal = line.map((x, i) => (x == null ? null : signalRaw[i]));
  const histogram = line.map((x, i) => (x != null && signal[i] != null ? x - (signal[i] as number) : null));
  return { line, signal, histogram };
}

export function bollinger(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (mid[i] == null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    const window = values.slice(i - period + 1, i + 1);
    const mean = mid[i] as number;
    const variance = window.reduce((acc, x) => acc + (x - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper.push(mean + mult * sd);
    lower.push(mean - mult * sd);
  }
  return { middle: mid, upper, lower };
}

/** Running VWAP from OHLCV. Null when the provider gives us no volume. */
export function vwap(candles: Candle[]): (number | null)[] {
  let cumPV = 0;
  let cumV = 0;
  return candles.map((c) => {
    const typical = (c.high + c.low + c.close) / 3;
    const vol = c.volume ?? 0;
    cumPV += typical * vol;
    cumV += vol;
    return cumV > 0 ? cumPV / cumV : null;
  });
}

/** Annualised realised volatility (%) from daily closes. */
export function realisedVolatility(closes: number[], lookback = 30): number | null {
  const slice = closes.slice(-Math.min(lookback + 1, closes.length));
  if (slice.length < 5) return null;
  const returns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    if (slice[i - 1] > 0) returns.push(Math.log(slice[i] / slice[i - 1]));
  }
  if (returns.length < 4) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

/** Swing-based support/resistance from the extremes of the recent window. */
export function supportResistance(candles: Candle[], lookback = 60) {
  const slice = candles.slice(-lookback);
  if (slice.length < 10) return { support: null as number | null, resistance: null as number | null };
  const lows = slice.map((c) => c.low).sort((a, b) => a - b);
  const highs = slice.map((c) => c.high).sort((a, b) => b - a);
  const pick = Math.max(1, Math.floor(slice.length * 0.1));
  const support = lows.slice(0, pick).reduce((a, b) => a + b, 0) / pick;
  const resistance = highs.slice(0, pick).reduce((a, b) => a + b, 0) / pick;
  return { support, resistance };
}

export function last<T>(arr: (T | null)[]): T | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null) return arr[i] as T;
  }
  return null;
}

/** Percent change between two prices; null-safe. */
export function pctChange(price: number | null | undefined, base: number | null | undefined): number | null {
  if (price == null || base == null || base === 0) return null;
  return ((price - base) / base) * 100;
}

export function atr(candles: Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < 2) return out;
  
  const tr: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const h_l = candles[i].high - candles[i].low;
    const h_pc = Math.abs(candles[i].high - candles[i - 1].close);
    const l_pc = Math.abs(candles[i].low - candles[i - 1].close);
    tr.push(Math.max(h_l, h_pc, l_pc));
  }
  
  if (candles.length < period) return out;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += tr[i];
  }
  out[period - 1] = sum / period;
  
  for (let i = period; i < candles.length; i++) {
    out[i] = ((out[i - 1] as number) * (period - 1) + tr[i]) / period;
  }
  return out;
}

export function momentum(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      out.push(null);
    } else {
      out.push(values[i] - values[i - period]);
    }
  }
  return out;
}

export function volumeTrend(candles: Candle[], shortPeriod = 5, longPeriod = 20): number | null {
  const volumes = candles.map((c) => c.volume ?? 0);
  if (volumes.length < longPeriod) return null;
  const shortSma = volumes.slice(-shortPeriod).reduce((a, b) => a + b, 0) / shortPeriod;
  const longSma = volumes.slice(-longPeriod).reduce((a, b) => a + b, 0) / longPeriod;
  return longSma > 0 ? shortSma / longSma : null;
}

export function maxDrawdown(closes: number[], lookback = 30): number | null {
  const slice = closes.slice(-lookback);
  if (slice.length === 0) return null;
  let peak = -Infinity;
  let maxDd = 0;
  for (const p of slice) {
    if (p > peak) peak = p;
    const dd = peak > 0 ? (peak - p) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd * 100;
}

export type IndicatorSnapshot = {
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema20: number | null;
  rsi14: number | null;
  macd: { line: number | null; signal: number | null; histogram: number | null };
  bollinger: { upper: number | null; middle: number | null; lower: number | null };
  vwap: number | null;
  volatility30d: number | null;
  support: number | null;
  resistance: number | null;
  trend: "UPTREND" | "DOWNTREND" | "SIDEWAYS" | "UNKNOWN";
  atr14: number | null;
  momentum14: number | null;
  relativeStrength55: number | null;
  volumeTrendRatio: number | null;
  maxDrawdown30d: number | null;
};

export function computeIndicators(candles: Candle[], benchmarkReturn55d?: number | null): IndicatorSnapshot {
  const closes = candles.map((c) => c.close).filter((c) => Number.isFinite(c));
  const m = macd(closes);
  const bb = bollinger(closes);
  const sr = supportResistance(candles);
  const s20 = last(sma(closes, 20));
  const s50 = last(sma(closes, 50));
  const price = closes[closes.length - 1] ?? null;

  let trend: IndicatorSnapshot["trend"] = "UNKNOWN";
  if (price != null && s20 != null && s50 != null) {
    if (price > s20 && s20 > s50) trend = "UPTREND";
    else if (price < s20 && s20 < s50) trend = "DOWNTREND";
    else trend = "SIDEWAYS";
  }

  // Relative Strength (stock return vs actual market index return over 55 days).
  // Null when no real benchmark return was supplied — never fabricated.
  const price55 = closes[closes.length - 55] || closes[0] || 0;
  const stockReturn = price55 > 0 && price != null ? (price - price55) / price55 : null;
  const relativeStrength =
    stockReturn != null && benchmarkReturn55d != null ? stockReturn - benchmarkReturn55d : null;

  return {
    sma20: s20,
    sma50: s50,
    sma200: last(sma(closes, 200)),
    ema20: last(ema(closes, 20)),
    rsi14: last(rsi(closes)),
    macd: { line: last(m.line), signal: last(m.signal), histogram: last(m.histogram) },
    bollinger: { upper: last(bb.upper), middle: last(bb.middle), lower: last(bb.lower) },
    vwap: last(vwap(candles)),
    volatility30d: realisedVolatility(closes),
    support: sr.support,
    resistance: sr.resistance,
    trend,
    atr14: last(atr(candles, 14)),
    momentum14: last(momentum(closes, 14)),
    relativeStrength55: relativeStrength,
    volumeTrendRatio: volumeTrend(candles),
    maxDrawdown30d: maxDrawdown(closes),
  };
}
