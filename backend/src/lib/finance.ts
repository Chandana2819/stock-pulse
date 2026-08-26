// Investment maths shared by the portfolio, goals and calculator modules.
// Everything here is deterministic and assumption-driven — the API always
// returns the assumptions alongside the numbers so the UI can show them.

export type CashFlow = { date: Date; amount: number }; // negative = invested, positive = received

/** Compound annual growth rate (%). Returns null when the inputs cannot support it. */
export function cagr(begin: number, end: number, years: number): number | null {
  if (begin <= 0 || years <= 0 || end < 0) return null;
  return (Math.pow(end / begin, 1 / years) - 1) * 100;
}

/**
 * XIRR via bisection. Newton-Raphson diverges badly on the lumpy cash-flow
 * patterns real portfolios produce, so we trade a little speed for a result
 * that always converges inside the bracket or honestly returns null.
 */
export function xirr(flows: CashFlow[], guessLow = -0.9999, guessHigh = 10): number | null {
  if (flows.length < 2) return null;
  const sorted = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const hasPositive = sorted.some((f) => f.amount > 0);
  const hasNegative = sorted.some((f) => f.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  const t0 = sorted[0].date.getTime();
  const npv = (rate: number) =>
    sorted.reduce((acc, f) => {
      const years = (f.date.getTime() - t0) / (365 * 24 * 3600 * 1000);
      return acc + f.amount / Math.pow(1 + rate, years);
    }, 0);

  let lo = guessLow;
  let hi = guessHigh;
  let fLo = npv(lo);
  let fHi = npv(hi);
  if (Number.isNaN(fLo) || Number.isNaN(fHi) || fLo * fHi > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-7) return mid * 100;
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return ((lo + hi) / 2) * 100;
}

/** Future value of a monthly SIP. `annualReturn` and `stepUpPct` are percentages. */
export function sipFutureValue(monthly: number, annualReturn: number, years: number, stepUpPct = 0) {
  const r = annualReturn / 100 / 12;
  const months = Math.round(years * 12);
  let value = 0;
  let contribution = monthly;
  let invested = 0;
  for (let m = 1; m <= months; m++) {
    value = (value + contribution) * (1 + r);
    invested += contribution;
    if (stepUpPct > 0 && m % 12 === 0) contribution *= 1 + stepUpPct / 100;
  }
  return { futureValue: value, invested, gain: value - invested };
}

export function lumpsumFutureValue(amount: number, annualReturn: number, years: number) {
  const futureValue = amount * Math.pow(1 + annualReturn / 100, years);
  return { futureValue, invested: amount, gain: futureValue - amount };
}

/** Monthly SIP needed to reach `target` in `years` at `annualReturn`. */
export function requiredMonthlySip(target: number, annualReturn: number, years: number, currentCorpus = 0) {
  const r = annualReturn / 100 / 12;
  const months = Math.round(years * 12);
  if (months <= 0) return null;
  const grownCorpus = currentCorpus * Math.pow(1 + r, months);
  const shortfall = Math.max(0, target - grownCorpus);
  if (shortfall === 0) return 0;
  if (r === 0) return shortfall / months;
  return shortfall / (((Math.pow(1 + r, months) - 1) / r) * (1 + r));
}

export function inflationAdjusted(amount: number, inflationPct: number, years: number) {
  return amount * Math.pow(1 + inflationPct / 100, years);
}

/**
 * Bull / base / bear projection band. The spread is derived from the assumed
 * return, not from a claim about the future — the caller must surface it as an
 * assumption, never a guarantee.
 */
export function scenarioBand(baseReturn: number) {
  return {
    bear: Math.max(-10, baseReturn - 7),
    base: baseReturn,
    bull: baseReturn + 6,
  };
}

/** Indian financial year label for a date, e.g. "2025-26". */
export function financialYear(date: Date): string {
  const y = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? y : y - 1; // FY starts 1 April
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function financialYearRange(fy: string): { start: Date; end: Date } {
  const startYear = Number(fy.split("-")[0]);
  return { start: new Date(startYear, 3, 1), end: new Date(startYear + 1, 2, 31, 23, 59, 59) };
}

export function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}
