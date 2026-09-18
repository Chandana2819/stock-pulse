"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "../../lib/api";
import SignalPriceChart from "../../components/SignalPriceChart";

type HistoryRow = {
  id: string;
  tradingDate: string;
  price: number | null;
  signal: string | null;
  score: number | null;
  confidence: number | null;
  risk: string | null;
  rsi: number | null;
  macd: number | null;
  trend: string | null;
  volume: number | null;
};

type MyPosition = {
  quantity: number;
  avgPrice: number;
  currentPrice: number | null;
  invested: number;
  currentValue: number | null;
  pl: number | null;
  plPct: number | null;
  purchaseDate: string | null;
  holdingPeriodDays: number | null;
} | null;

type Overview = {
  month: number; year: number; tradingDays: number;
  stockReturnPct: number | null; myReturnPct: number | null;
  avgScore: number | null; lastScore: number | null; startScore: number | null; highScore: number | null; lowScore: number | null;
  avgConfidence: number | null; lastConfidence: number | null; startConfidence: number | null;
  mostFrequentSignal: string | null; firstSignal: string | null; lastSignal: string | null;
  signalChanges: number; signalCounts: Record<string, number>;
  currentRisk: string | null; previousRisk: string | null; riskChanges: number;
  investedValue: number | null; currentValue: number | null; pl: number | null; plPct: number | null;
};

type SeriesStats = { series: { date: string; value: number | null }[]; start: number | null; end: number | null; avg: number | null; high: number | null; low: number | null; change: number | null };

type MasterReviewPayload = {
  ticker: string; month: number; year: number; tradingDays: number;
  message?: string;
  myPosition: MyPosition;
  overview: Overview;
  previousOverview: Overview | null;
  journey: { timeline: { date: string; signal: string | null }[]; counts: Record<string, number>; mostFrequentSignal: string | null; firstSignal: string | null; lastSignal: string | null; signalChanges: number };
  scoreConfidence: { score: SeriesStats; confidence: SeriesStats };
  priceVsSignal: { date: string; price: number | null; signal: string | null }[];
  reasonsAnalysis: { tradingDays: number; positive: { text: string; days: number }[]; negative: { text: string; days: number }[]; neutral: { text: string; days: number }[] };
  warningsAnalysis: { hasAnyWarnings: boolean; current: string[]; history: { text: string; days: number }[]; newThisMonth: string[]; disappeared: string[] };
  evolution: { points: { date: string; entryMin: number | null; entryMax: number | null; stopLoss: number | null; targetMin: number | null; targetMax: number | null }[]; summary: string[] };
  riskReview: { history: { date: string; risk: string | null }[]; daysAtRisk: Record<string, number>; currentRisk: string | null; previousRisk: string | null; riskChanges: number };
  changeSummary: { improved: string[]; weakened: string[]; stable: string[] };
  historicalValidation: { buy: { horizon: number; sampleSize: number; avgReturnPct: number | null }[]; sell: { horizon: number; sampleSize: number; avgReturnPct: number | null }[]; note: string | null };
  monitor: string[];
  masterReview: {
    monthLabel: string; tradingDaysNote: string;
    whatHappened: string[]; signalBehavior: string[]; priceBehavior: string[]; myPosition: string[];
    whatImproved: string[]; whatWeakened: string[]; risks: string[]; whatToMonitor: string[];
  };
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const UNAVAILABLE = "Data unavailable";
const price = (n: number | null) => (n == null ? UNAVAILABLE : `₹${n.toFixed(2)}`);
const pct = (n: number | null) => (n == null ? UNAVAILABLE : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);
const numFmt = (n: number | null, digits = 1) => (n == null ? UNAVAILABLE : n.toFixed(digits));

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border-bright bg-bg-1 p-6 flex flex-col gap-3">
      <h2 className="font-display text-lg tracking-[0.06em] text-text-custom">
        <span className="text-text-4 mr-2">{n}.</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (items.length === 0) return <div className="text-xs text-text-4 font-mono">{UNAVAILABLE}</div>;
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((line, i) => (
        <li key={i} className="text-xs text-text-2 leading-relaxed flex gap-2">
          <span className="text-green-custom">•</span>
          {line}
        </li>
      ))}
    </ul>
  );
}

export default function StockMasterReviewPage() {
  const params = useParams();
  const ticker = decodeURIComponent(String(params.ticker || "")).toUpperCase();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [allHistory, setAllHistory] = useState<HistoryRow[]>([]);
  const [chartRange, setChartRange] = useState<"1M" | "3M" | "6M" | "1Y">("3M");

  const [data, setData] = useState<MasterReviewPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ ticker: string; holding: unknown; history: HistoryRow[] }>(`/api/stock-learning/stock/${encodeURIComponent(ticker)}/history`)
      .then((d) => setAllHistory(d.history))
      .catch(() => setAllHistory([]));
    api
      .get<{ months: string[] }>(`/api/stock-learning/stock/${encodeURIComponent(ticker)}/available-months`)
      .then((d) => setAvailableMonths(d.months))
      .catch(() => setAvailableMonths([]));
  }, [ticker]);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<MasterReviewPayload>(`/api/stock-learning/stock/${encodeURIComponent(ticker)}/master-review?month=${month}&year=${year}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [ticker, month, year]);

  useEffect(() => {
    load();
  }, [load]);

  const goPrevMonth = () => {
    const d = new Date(Date.UTC(year, month - 2, 1));
    setMonth(d.getUTCMonth() + 1);
    setYear(d.getUTCFullYear());
  };
  const goNextMonth = () => {
    const d = new Date(Date.UTC(year, month, 1));
    setMonth(d.getUTCMonth() + 1);
    setYear(d.getUTCFullYear());
  };

  const chartPoints = useMemo(() => {
    const withPrice = allHistory.filter((r) => r.price != null);
    const days = { "1M": 30, "3M": 90, "6M": 180, "1Y": 365 }[chartRange];
    const cutoff = Date.now() - days * 86400000;
    return withPrice.filter((r) => new Date(r.tradingDate).getTime() >= cutoff).map((r) => ({ time: Math.floor(new Date(r.tradingDate).getTime() / 1000), value: r.price as number }));
  }, [allHistory, chartRange]);

  const priceStats = useMemo(() => {
    const prices = allHistory.filter((r) => r.price != null).map((r) => r.price as number);
    if (prices.length === 0) return null;
    return { open: prices[0], high: Math.max(...prices), low: Math.min(...prices), latest: prices[prices.length - 1] };
  }, [allHistory]);

  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  return (
    <div className="max-w-[1100px] mx-auto w-full p-4 sm:p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/stock-learning" className="font-mono text-[0.6rem] text-text-3 hover:text-text-custom underline">
            ← STOCK LEARNING &amp; REVIEW
          </Link>
          <h1 className="font-display text-3xl tracking-[0.1em] text-text-custom mt-1">{ticker} — MASTER CLOSE-UP REVIEW</h1>
          <p className="text-[0.65rem] text-text-4 font-mono mt-1">
            This is not the daily signal. It combines your position, every uploaded daily StockSignals snapshot, and month-over-month change.
          </p>
        </div>
      </div>

      {/* Month selector */}
      <div className="border border-border-bright bg-bg-1 p-4 flex items-center justify-between gap-3">
        <button onClick={goPrevMonth} className="font-mono text-xs border border-border-custom px-3 py-1.5 hover:bg-bg-3">
          ← Previous Month
        </button>
        <div className="flex items-center gap-2">
          <span className="font-display text-lg text-text-custom">{monthLabel}</span>
          {availableMonths.length > 0 && (
            <select
              value={`${year}-${month}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split("-").map(Number);
                setYear(y);
                setMonth(m);
              }}
              className="font-mono text-[0.6rem] bg-bg border border-border-custom text-text-2 p-1"
            >
              {availableMonths.map((key) => {
                const [y, m] = key.split("-").map(Number);
                return (
                  <option key={key} value={key}>
                    {MONTH_NAMES[m - 1]} {y}
                  </option>
                );
              })}
            </select>
          )}
        </div>
        <button onClick={goNextMonth} className="font-mono text-xs border border-border-custom px-3 py-1.5 hover:bg-bg-3">
          Next Month →
        </button>
      </div>

      {loading ? (
        <div className="font-mono text-xs text-text-3 animate-pulse text-center py-10">Loading master review…</div>
      ) : !data || data.tradingDays === 0 ? (
        <div className="border border-amber-custom bg-bg-2 p-6 text-center text-xs text-amber-custom font-mono">
          {data?.message ?? `No StockSignals data available for ${ticker} in ${monthLabel}.`}
        </div>
      ) : (
        <>
          {/* 1. My Position */}
          <Section n={1} title="My Position">
            {!data.myPosition ? (
              <div className="text-xs text-text-3 font-mono">You don't hold {ticker} — no purchase price, quantity or P&amp;L on record.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ["Quantity", data.myPosition.quantity.toString()],
                  ["Average Buy Price", price(data.myPosition.avgPrice)],
                  ["Current Price", price(data.myPosition.currentPrice)],
                  ["Invested", price(data.myPosition.invested)],
                  ["Current Value", price(data.myPosition.currentValue)],
                  ["P&L", data.myPosition.pl != null ? `${data.myPosition.pl >= 0 ? "+" : ""}${price(data.myPosition.pl)}` : UNAVAILABLE],
                  ["Return", pct(data.myPosition.plPct)],
                  ["Holding Period", data.myPosition.holdingPeriodDays != null ? `${data.myPosition.holdingPeriodDays} days` : UNAVAILABLE],
                ].map(([label, value]) => (
                  <div key={label} className="border border-border-custom bg-bg-2 p-3">
                    <div className="font-mono text-[0.55rem] text-text-3 uppercase">{label}</div>
                    <div className="font-mono text-sm font-bold text-text-custom mt-1">{value}</div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 2. Monthly Overview */}
          <Section n={2} title={`Monthly Overview — ${monthLabel}`}>
            <div className="border border-border-custom bg-bg-2 p-3 font-mono text-[0.6rem] text-amber-custom mb-1">{data.masterReview.tradingDaysNote}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ["Stock Return", pct(data.overview.stockReturnPct)],
                ["My Return (this month)", pct(data.overview.myReturnPct)],
                ["Average Score", numFmt(data.overview.avgScore)],
                ["Average Confidence", data.overview.avgConfidence != null ? `${data.overview.avgConfidence.toFixed(0)}%` : UNAVAILABLE],
                ["Most Frequent Signal", data.overview.mostFrequentSignal ?? UNAVAILABLE],
                ["Signal Changes", data.overview.signalChanges.toString()],
                ["Risk Changes", data.overview.riskChanges.toString()],
              ].map(([label, value]) => (
                <div key={label} className="border border-border-custom bg-bg-2 p-3">
                  <div className="font-mono text-[0.55rem] text-text-3 uppercase">{label}</div>
                  <div className="font-mono text-sm font-bold text-text-custom mt-1">{value}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* 3. Price Performance */}
          <Section n={3} title="Price Performance (from your uploaded data)">
            {priceStats ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
                {[
                  ["Opening (in range)", price(priceStats.open)],
                  ["Highest", price(priceStats.high)],
                  ["Lowest", price(priceStats.low)],
                  ["Latest / Closing", price(priceStats.latest)],
                ].map(([label, value]) => (
                  <div key={label} className="border border-border-custom bg-bg-2 p-3">
                    <div className="font-mono text-[0.55rem] text-text-3 uppercase">{label}</div>
                    <div className="font-mono text-sm font-bold text-text-custom mt-1">{value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-text-3 font-mono mb-2">No uploaded price series for {ticker} yet.</div>
            )}
            <div className="flex gap-2 mb-2">
              {(["1M", "3M", "6M", "1Y"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setChartRange(r)}
                  className={`font-mono text-[0.6rem] px-2.5 py-1 border ${chartRange === r ? "border-green-custom text-green-custom bg-green-dim" : "border-border-custom text-text-3"}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <SignalPriceChart points={chartPoints} stock={ticker} />
          </Section>

          {/* 4. Signal Journey */}
          <Section n={4} title="Signal Journey">
            <div className="flex flex-wrap gap-2 mb-3">
              {data.journey.timeline.map((t, i) => (
                <span key={i} className="font-mono text-[0.6rem] border border-border-custom bg-bg-2 px-2 py-1">
                  {t.date.slice(5)} → <span className="text-text-custom font-bold">{t.signal ?? "—"}</span>
                </span>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(data.journey.counts).map(([signal, count]) => (
                <div key={signal} className="border border-border-custom bg-bg-2 p-3">
                  <div className="font-mono text-[0.55rem] text-text-3 uppercase">{signal} days</div>
                  <div className="font-mono text-sm font-bold text-text-custom mt-1">{count}</div>
                </div>
              ))}
              <div className="border border-border-custom bg-bg-2 p-3">
                <div className="font-mono text-[0.55rem] text-text-3 uppercase">Signal Changes</div>
                <div className="font-mono text-sm font-bold text-text-custom mt-1">{data.journey.signalChanges}</div>
              </div>
            </div>
            <div className="text-xs text-text-2 font-mono mt-2">
              First signal: <b>{data.journey.firstSignal ?? UNAVAILABLE}</b> · Latest signal: <b>{data.journey.lastSignal ?? UNAVAILABLE}</b> · Most frequent: <b>{data.journey.mostFrequentSignal ?? UNAVAILABLE}</b>
            </div>
          </Section>

          {/* 5. Score & Confidence Movement */}
          <Section n={5} title="Score & Confidence Movement">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                ["Score", data.scoreConfidence.score],
                ["Confidence", data.scoreConfidence.confidence],
              ].map(([label, s]) => {
                const stats = s as SeriesStats;
                return (
                  <div key={label as string} className="border border-border-custom bg-bg-2 p-4">
                    <div className="font-mono text-[0.6rem] tracking-wider text-text-3 uppercase mb-2">{label as string}</div>
                    <div className="font-mono text-xs text-text-2 mb-2">
                      {stats.series.map((p) => (p.value != null ? p.value.toFixed(0) : "—")).join(" → ")}
                    </div>
                    <div className="grid grid-cols-2 gap-2 font-mono text-[0.6rem] text-text-3">
                      <span>Start: <b className="text-text-custom">{numFmt(stats.start, 0)}</b></span>
                      <span>End: <b className="text-text-custom">{numFmt(stats.end, 0)}</b></span>
                      <span>High: <b className="text-text-custom">{numFmt(stats.high, 0)}</b></span>
                      <span>Low: <b className="text-text-custom">{numFmt(stats.low, 0)}</b></span>
                      <span>Avg: <b className="text-text-custom">{numFmt(stats.avg, 1)}</b></span>
                      <span>Change: <b className="text-text-custom">{stats.change != null ? `${stats.change >= 0 ? "+" : ""}${stats.change.toFixed(0)}` : UNAVAILABLE}</b></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* 6. Price vs Signal */}
          <Section n={6} title="Price vs Signal">
            <p className="text-[0.62rem] text-text-4 font-mono mb-2">Shown side by side from your uploaded data only — this does not imply the signal caused the price move, or vice versa.</p>
            <div className="overflow-x-auto border border-border-custom max-h-72 overflow-y-auto">
              <table className="w-full text-left border-collapse min-w-[400px]">
                <thead className="sticky top-0 bg-bg-2">
                  <tr className="font-mono text-[0.58rem] text-text-3 uppercase border-b border-border-custom">
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-2 text-right">Price</th>
                    <th className="py-2 px-2 text-center">Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {data.priceVsSignal.map((r, i) => (
                    <tr key={i} className="text-xs border-b border-border-custom">
                      <td className="py-1.5 px-3 font-mono">{r.date}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{r.price != null ? `₹${r.price.toFixed(2)}` : "—"}</td>
                      <td className="py-1.5 px-2 text-center font-mono">{r.signal ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* 7. Reasons Analysis */}
          <Section n={7} title="Reasons Analysis">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="font-mono text-[0.6rem] tracking-wider text-green-custom uppercase mb-2">Repeated Positive Factors</div>
                {data.reasonsAnalysis.positive.length === 0 ? (
                  <div className="text-xs text-text-4 font-mono">None found in uploaded data.</div>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {data.reasonsAnalysis.positive.map((r, i) => (
                      <li key={i} className="text-xs text-text-2">{r.text}: <b>{r.days}/{data.reasonsAnalysis.tradingDays} days</b></li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="font-mono text-[0.6rem] tracking-wider text-red-custom uppercase mb-2">Repeated Negative Factors</div>
                {data.reasonsAnalysis.negative.length === 0 ? (
                  <div className="text-xs text-text-4 font-mono">None found in uploaded data.</div>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {data.reasonsAnalysis.negative.map((r, i) => (
                      <li key={i} className="text-xs text-text-2">{r.text}: <b>{r.days}/{data.reasonsAnalysis.tradingDays} days</b></li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Section>

          {/* 8. Warnings Analysis */}
          <Section n={8} title="Warnings Analysis">
            {!data.warningsAnalysis.hasAnyWarnings ? (
              <div className="text-xs text-text-3 font-mono">No warnings recorded.</div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="text-xs text-text-2 font-mono">Current: <b>{data.warningsAnalysis.current.join(", ") || "None"}</b></div>
                <ul className="flex flex-col gap-1">
                  {data.warningsAnalysis.history.map((w, i) => (
                    <li key={i} className="text-xs text-text-2">{w.text} — appeared {w.days} day{w.days === 1 ? "" : "s"}</li>
                  ))}
                </ul>
                {data.warningsAnalysis.newThisMonth.length > 0 && <div className="text-xs text-amber-custom font-mono">New this period: {data.warningsAnalysis.newThisMonth.join(", ")}</div>}
                {data.warningsAnalysis.disappeared.length > 0 && <div className="text-xs text-green-custom font-mono">Disappeared: {data.warningsAnalysis.disappeared.join(", ")}</div>}
              </div>
            )}
          </Section>

          {/* 9. Entry/Stop/Target Evolution */}
          <Section n={9} title="Entry / Stop / Target Evolution">
            {data.evolution.points.length > 0 && (
              <div className="overflow-x-auto border border-border-custom mb-3">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr className="font-mono text-[0.58rem] text-text-3 uppercase border-b border-border-custom bg-bg-2">
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-2 text-right">Entry</th>
                      <th className="py-2 px-2 text-right">Stop</th>
                      <th className="py-2 px-2 text-right">Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.evolution.points.map((p, i) => (
                      <tr key={i} className="text-xs border-b border-border-custom">
                        <td className="py-1.5 px-3 font-mono">{p.date}</td>
                        <td className="py-1.5 px-2 text-right font-mono">{p.entryMin != null && p.entryMax != null ? `₹${p.entryMin.toFixed(2)}–₹${p.entryMax.toFixed(2)}` : "—"}</td>
                        <td className="py-1.5 px-2 text-right font-mono">{p.stopLoss != null ? `₹${p.stopLoss.toFixed(2)}` : "—"}</td>
                        <td className="py-1.5 px-2 text-right font-mono">{p.targetMin != null && p.targetMax != null ? `₹${p.targetMin.toFixed(2)}–₹${p.targetMax.toFixed(2)}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Bullets items={data.evolution.summary} />
          </Section>

          {/* 10. My P&L vs Stock Performance */}
          <Section n={10} title="My P&L vs Stock Performance">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border border-border-custom bg-bg-2 p-4">
                <div className="font-mono text-[0.6rem] text-text-3 uppercase mb-1">Stock Performance</div>
                <div className="font-mono text-lg font-bold text-text-custom">{pct(data.overview.stockReturnPct)}</div>
                <div className="text-[0.6rem] text-text-4 font-mono">Monthly price return</div>
              </div>
              <div className="border border-border-custom bg-bg-2 p-4">
                <div className="font-mono text-[0.6rem] text-text-3 uppercase mb-1">My Investment Performance</div>
                <div className="font-mono text-lg font-bold text-text-custom">{data.overview.pl != null ? `${price(data.overview.pl)} (${pct(data.overview.plPct)})` : UNAVAILABLE}</div>
                <div className="text-[0.6rem] text-text-4 font-mono">Based on my average buy price and quantity</div>
              </div>
            </div>
            {data.overview.stockReturnPct != null && data.overview.plPct != null && Math.abs(data.overview.stockReturnPct - data.overview.plPct) > 1 && (
              <p className="text-xs text-text-3 font-mono mt-2">These differ because your purchase price/timing differs from the month's opening price — not because of an error.</p>
            )}
          </Section>

          {/* 11. Risk Review */}
          <Section n={11} title="Risk Review">
            <div className="font-mono text-xs text-text-2 mb-2">{data.riskReview.history.map((h) => h.risk ?? "—").join(" → ")}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(data.riskReview.daysAtRisk).map(([risk, days]) => (
                <div key={risk} className="border border-border-custom bg-bg-2 p-3">
                  <div className="font-mono text-[0.55rem] text-text-3 uppercase">{risk}</div>
                  <div className="font-mono text-sm font-bold text-text-custom mt-1">{days} days</div>
                </div>
              ))}
            </div>
            <div className="text-xs text-text-2 font-mono mt-2">
              Current: <b>{data.riskReview.currentRisk ?? UNAVAILABLE}</b> · Start of month: <b>{data.riskReview.previousRisk ?? UNAVAILABLE}</b> · Changes: <b>{data.riskReview.riskChanges}</b>
            </div>
          </Section>

          {/* 12-14. What Improved / Weakened / Stable */}
          <Section n={12} title="What Improved">
            <Bullets items={data.changeSummary.improved} />
          </Section>
          <Section n={13} title="What Weakened">
            <Bullets items={data.changeSummary.weakened} />
          </Section>
          <Section n={14} title="What Remained Stable">
            <Bullets items={data.changeSummary.stable} />
          </Section>

          {/* 15. Month-over-Month Comparison */}
          <Section n={15} title="Month-over-Month Comparison">
            {!data.previousOverview ? (
              <div className="text-xs text-text-3 font-mono">No previous month's data is available for comparison.</div>
            ) : (
              <div className="overflow-x-auto border border-border-custom">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr className="font-mono text-[0.58rem] text-text-3 uppercase border-b border-border-custom bg-bg-2">
                      <th className="py-2 px-3">Metric</th>
                      <th className="py-2 px-2 text-right">{MONTH_NAMES[data.previousOverview.month - 1]} {data.previousOverview.year}</th>
                      <th className="py-2 px-2 text-right">{monthLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Stock Return", pct(data.previousOverview.stockReturnPct), pct(data.overview.stockReturnPct)],
                      ["Average Score", numFmt(data.previousOverview.avgScore), numFmt(data.overview.avgScore)],
                      ["Average Confidence", data.previousOverview.avgConfidence != null ? `${data.previousOverview.avgConfidence.toFixed(0)}%` : UNAVAILABLE, data.overview.avgConfidence != null ? `${data.overview.avgConfidence.toFixed(0)}%` : UNAVAILABLE],
                      ["Most Frequent Signal", data.previousOverview.mostFrequentSignal ?? UNAVAILABLE, data.overview.mostFrequentSignal ?? UNAVAILABLE],
                      ["Signal Changes", data.previousOverview.signalChanges.toString(), data.overview.signalChanges.toString()],
                      ["Risk", data.previousOverview.currentRisk ?? UNAVAILABLE, data.overview.currentRisk ?? UNAVAILABLE],
                    ].map(([label, prev, curr]) => (
                      <tr key={label} className="text-xs border-b border-border-custom">
                        <td className="py-1.5 px-3 font-mono">{label}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-text-3">{prev}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-text-custom font-bold">{curr}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* 16. Learning */}
          <Section n={16} title="Learning">
            <div className="flex flex-col gap-4">
              {[
                {
                  title: "Score",
                  current: numFmt(data.overview.lastScore, 0),
                  body: `This app's own BullHawk score for this stock, out of 100. It moved from ${numFmt(data.overview.startScore, 0)} to ${numFmt(data.overview.lastScore, 0)} during ${monthLabel}. Why it matters: a rising score generally means more factors are lining up favorably; a falling score means the opposite.`,
                },
                {
                  title: "Confidence",
                  current: data.overview.lastConfidence != null ? `${data.overview.lastConfidence.toFixed(0)}%` : UNAVAILABLE,
                  body: `How much agreement there is across the underlying factors, not a prediction of accuracy. It moved from ${data.overview.startConfidence != null ? `${data.overview.startConfidence.toFixed(0)}%` : UNAVAILABLE} to ${data.overview.lastConfidence != null ? `${data.overview.lastConfidence.toFixed(0)}%` : UNAVAILABLE} this month.`,
                },
                {
                  title: "Risk Rating",
                  current: data.overview.currentRisk ?? UNAVAILABLE,
                  body: `A qualitative read of how volatile/uncertain this stock's setup currently looks. ${data.overview.riskChanges > 0 ? `It changed ${data.overview.riskChanges} time(s) this month (${data.overview.previousRisk} → ${data.overview.currentRisk}).` : "It stayed the same all month."}`,
                },
                {
                  title: "Entry Zone / Stop-Loss / Target Range",
                  current: data.evolution.points.length > 0 ? "See section 9 above" : UNAVAILABLE,
                  body: "The suggested price band to enter at, the level that would invalidate the setup (stop-loss), and the level the model expects the stock could reach (target range). These evolve daily as prices move.",
                },
              ].map((item) => (
                <div key={item.title} className="border border-border-custom bg-bg-2 p-4">
                  <div className="font-display text-sm text-green-custom mb-1">{item.title}</div>
                  <div className="font-mono text-xs text-text-3 mb-1">Current: {item.current}</div>
                  <p className="text-xs text-text-2 leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* 17. Historical Signal Validation */}
          <Section n={17} title="Historical Signal Validation">
            <p className="text-[0.62rem] text-text-4 font-mono mb-2">
              Uses every uploaded day for {ticker}, not just this month. Historical behavior — never a guarantee of future results.
            </p>
            {data.historicalValidation.note ? (
              <div className="text-xs text-text-3 font-mono">{data.historicalValidation.note}</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  ["After a BUY signal", data.historicalValidation.buy],
                  ["After a SELL/REDUCE signal", data.historicalValidation.sell],
                ].map(([label, results]) => (
                  <div key={label as string} className="border border-border-custom bg-bg-2 p-4">
                    <div className="font-mono text-[0.6rem] text-text-3 uppercase mb-2">{label as string}</div>
                    <ul className="flex flex-col gap-1">
                      {(results as { horizon: number; sampleSize: number; avgReturnPct: number | null }[]).map((r) => (
                        <li key={r.horizon} className="text-xs text-text-2 font-mono">
                          {r.horizon} days later: {r.avgReturnPct != null ? `avg ${pct(r.avgReturnPct)}` : UNAVAILABLE} ({r.sampleSize} sample{r.sampleSize === 1 ? "" : "s"})
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 18. What to Monitor Next Month */}
          <Section n={18} title="What to Monitor Next Month">
            <Bullets items={data.monitor} />
          </Section>

          {/* 19. Master Monthly Review */}
          <Section n={19} title="Master Monthly Review">
            <div className="border border-border-custom bg-bg-2 p-3 font-mono text-[0.6rem] text-amber-custom mb-3">{data.masterReview.tradingDaysNote}</div>
            <div className="flex flex-col gap-4">
              {[
                ["What Happened", data.masterReview.whatHappened],
                ["Signal Behavior", data.masterReview.signalBehavior],
                ["Price Behavior", data.masterReview.priceBehavior],
                ["My Position", data.masterReview.myPosition],
                ["What Improved", data.masterReview.whatImproved],
                ["What Weakened", data.masterReview.whatWeakened],
                ["Risks", data.masterReview.risks],
                ["What to Monitor", data.masterReview.whatToMonitor],
              ].map(([label, lines]) => (
                <div key={label as string} className="border border-border-custom bg-bg-2 p-4">
                  <div className="font-mono text-[0.6rem] tracking-[0.12em] text-text-3 uppercase mb-2">{label as string}</div>
                  <Bullets items={lines as string[]} />
                </div>
              ))}
            </div>
            <p className="font-mono text-[0.58rem] text-text-4 italic mt-3">
              Every line above is computed directly from your stored daily uploads and portfolio data — not an AI guess.
            </p>
          </Section>
        </>
      )}
    </div>
  );
}
