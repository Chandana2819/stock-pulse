"use client";

type Fundamentals = {
  peRatio: number | null;
  forwardPe: number | null;
  pbRatio: number | null;
  roe: number | null;
  roce: number | null;
  debtToEquity: number | null;
  revenueGrowth: number | null;
  profitGrowth: number | null;
  eps: number | null;
  dividendYield: number | null;
  marketCap: number | null;
  beta: number | null;
  promoterHolding: number | null;
  fiiHolding: number | null;
} | null;

type Indicators = {
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  macd: { line: number | null; signal: number | null; histogram: number | null };
  bollinger: { upper: number | null; middle: number | null; lower: number | null };
  vwap: number | null;
  volatility30d: number | null;
  support: number | null;
  resistance: number | null;
  trend: string;
} | null;

function fmt(n: number | null | undefined, opts: { suffix?: string; digits?: number; cr?: boolean } = {}) {
  if (n == null) return "—";
  if (opts.cr) return `₹${(n / 1e7).toFixed(1)}Cr`;
  return `${n.toFixed(opts.digits ?? 2)}${opts.suffix ?? ""}`;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | "neutral" }) {
  return (
    <div className="flex flex-col gap-0.5 p-2.5 border border-border-custom bg-bg-2">
      <span className="font-mono text-[0.55rem] tracking-[0.12em] text-text-3 uppercase">{label}</span>
      <span className={`font-mono text-sm font-bold ${tone === "up" ? "text-green-custom" : tone === "down" ? "text-red-custom" : "text-text-custom"}`}>{value}</span>
    </div>
  );
}

export default function FundamentalsPanel({ fundamentals, indicators }: { fundamentals: Fundamentals; indicators: Indicators }) {
  return (
    <div className="border border-border-bright bg-bg-1 overflow-hidden">
      <div className="py-[0.6rem] px-6 border-b border-border-custom bg-bg-2">
        <span className="font-mono text-[0.65rem] tracking-[0.12em] text-text-3 uppercase">FUNDAMENTALS & TECHNICALS</span>
      </div>
      <div className="p-6 flex flex-col gap-5">
        <div>
          <div className="font-mono text-[0.58rem] tracking-[0.18em] text-text-3 uppercase mb-2">VALUATION & FUNDAMENTALS</div>
          {fundamentals ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="PE" value={fmt(fundamentals.peRatio)} />
              <Stat label="Forward PE" value={fmt(fundamentals.forwardPe)} />
              <Stat label="PB" value={fmt(fundamentals.pbRatio)} />
              <Stat label="ROE" value={fmt(fundamentals.roe, { suffix: "%" })} tone={fundamentals.roe != null ? (fundamentals.roe >= 15 ? "up" : "down") : undefined} />
              <Stat label="ROCE" value={fmt(fundamentals.roce, { suffix: "%" })} />
              <Stat label="Debt/Equity" value={fmt(fundamentals.debtToEquity)} tone={fundamentals.debtToEquity != null ? (fundamentals.debtToEquity <= 1 ? "up" : "down") : undefined} />
              <Stat label="Revenue Growth" value={fmt(fundamentals.revenueGrowth, { suffix: "%" })} tone={fundamentals.revenueGrowth != null ? (fundamentals.revenueGrowth >= 0 ? "up" : "down") : undefined} />
              <Stat label="Profit Growth" value={fmt(fundamentals.profitGrowth, { suffix: "%" })} tone={fundamentals.profitGrowth != null ? (fundamentals.profitGrowth >= 0 ? "up" : "down") : undefined} />
              <Stat label="EPS" value={fmt(fundamentals.eps)} />
              <Stat label="Dividend Yield" value={fmt(fundamentals.dividendYield, { suffix: "%" })} />
              <Stat label="Market Cap" value={fmt(fundamentals.marketCap, { cr: true })} />
              <Stat label="Beta" value={fmt(fundamentals.beta)} />
              <Stat label="Promoter Holding" value={fmt(fundamentals.promoterHolding, { suffix: "%" })} />
              <Stat label="FII Holding" value={fmt(fundamentals.fiiHolding, { suffix: "%" })} />
            </div>
          ) : (
            <div className="font-mono text-xs text-text-3 p-3 border border-border-custom bg-bg-2">Fundamentals not available for this symbol.</div>
          )}
        </div>

        <div>
          <div className="font-mono text-[0.58rem] tracking-[0.18em] text-text-3 uppercase mb-2">TECHNICAL INDICATORS</div>
          {indicators ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Trend" value={indicators.trend} tone={indicators.trend === "UPTREND" ? "up" : indicators.trend === "DOWNTREND" ? "down" : undefined} />
              <Stat label="RSI (14)" value={fmt(indicators.rsi14, { digits: 0 })} tone={indicators.rsi14 != null ? (indicators.rsi14 >= 70 ? "down" : indicators.rsi14 <= 30 ? "up" : undefined) : undefined} />
              <Stat label="SMA 20" value={fmt(indicators.sma20)} />
              <Stat label="SMA 50" value={fmt(indicators.sma50)} />
              <Stat label="SMA 200" value={fmt(indicators.sma200)} />
              <Stat label="MACD Histogram" value={fmt(indicators.macd.histogram)} tone={indicators.macd.histogram != null ? (indicators.macd.histogram >= 0 ? "up" : "down") : undefined} />
              <Stat label="VWAP" value={fmt(indicators.vwap)} />
              <Stat label="30D Volatility" value={fmt(indicators.volatility30d, { suffix: "%", digits: 0 })} />
              <Stat label="Support" value={fmt(indicators.support)} />
              <Stat label="Resistance" value={fmt(indicators.resistance)} />
              <Stat label="Bollinger Upper" value={fmt(indicators.bollinger.upper)} />
              <Stat label="Bollinger Lower" value={fmt(indicators.bollinger.lower)} />
            </div>
          ) : (
            <div className="font-mono text-xs text-text-3 p-3 border border-border-custom bg-bg-2">Not enough chart history to compute indicators.</div>
          )}
        </div>
      </div>
    </div>
  );
}
