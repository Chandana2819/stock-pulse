"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiRequestError } from "../lib/api";

type Day = {
  date: string;
  investedInr: number;
  valueInr: number;
  pnlInr: number;
  pnlPct: number | null;
  dayChangeInr: number | null;
  dayReturnPct: number | null;
  cumulativeReturnPct: number;
  niftyDayReturnPct: number | null;
  niftyCumulativeReturnPct: number | null;
};

type Period = {
  key: string;
  start: string;
  end: string;
  tradingDays: number;
  endInvestedInr: number;
  endValueInr: number;
  pnlChangeInr: number;
  returnPct: number | null;
  niftyReturnPct: number | null;
};

type TrackRecord = {
  days: Day[];
  weekly: Period[];
  monthly: Period[];
  summary: {
    daysTracked: number;
    since: string | null;
    portfolioReturnPct: number | null;
    niftyReturnPct: number | null;
    currentPnlInr: number | null;
    currentPnlPct: number | null;
  };
};

type View = "DAILY" | "WEEKLY" | "MONTHLY";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const signedInr = (n: number) => `${n >= 0 ? "+" : "-"}${inr(Math.abs(n))}`;
const signed = (n: number) => `${n > 0 ? "+" : ""}${n}%`;
const tone = (n: number | null) => (n == null ? "text-text-3" : n > 0 ? "text-green-custom" : n < 0 ? "text-red-custom" : "text-text-2");
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const periodLabel = (p: Period, view: View) =>
  view === "MONTHLY" ? `${MONTHS[Number(p.key.slice(5, 7)) - 1]} ${p.key.slice(0, 4)}` : `${shortDate(p.start)} – ${shortDate(p.end)}`;
const toTime = (iso: string) => Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 1000) as any;

const CHART_OPTIONS = (width: number) => ({
  layout: { background: { type: "solid", color: "#0a0a0f" }, textColor: "#9ca3af" },
  grid: { vertLines: { color: "#1a1a2e" }, horzLines: { color: "#1a1a2e" } },
  rightPriceScale: { borderColor: "#1a1a2e" },
  timeScale: { borderColor: "#1a1a2e" },
  width,
  height: 220,
});

// Daily view: cumulative return since the first snapshot, mine vs NIFTY.
// Weekly / monthly view: one bar per period (green up, red down) with NIFTY's
// return for the same period as a line on top.
function TrackChart({ view, days, periods }: { view: View; days: Day[]; periods: Period[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    let chart: any;
    let onResize: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      const { createChart, ColorType, LineSeries, HistogramSeries } = await import("lightweight-charts");
      if (cancelled || !ref.current) return;
      ref.current.innerHTML = "";
      const opts: any = CHART_OPTIONS(ref.current.clientWidth);
      opts.layout.background.type = ColorType.Solid;
      chart = createChart(ref.current, opts);

      if (view === "DAILY") {
        const mine = chart.addSeries(LineSeries, { color: "#00d4aa", lineWidth: 2 });
        mine.setData(days.map((d) => ({ time: toTime(d.date), value: d.cumulativeReturnPct })));
        const nifty = days.filter((d) => d.niftyCumulativeReturnPct != null);
        if (nifty.length >= 2) {
          chart
            .addSeries(LineSeries, { color: "#9ca3af", lineWidth: 1, lineStyle: 2 })
            .setData(nifty.map((d) => ({ time: toTime(d.date), value: d.niftyCumulativeReturnPct as number })));
        }
      } else {
        const scored = periods.filter((p) => p.returnPct != null);
        chart.addSeries(HistogramSeries, {}).setData(
          scored.map((p) => ({
            time: toTime(p.start),
            value: p.returnPct as number,
            color: (p.returnPct as number) >= 0 ? "#00d4aa" : "#ff4757",
          }))
        );
        const nifty = scored.filter((p) => p.niftyReturnPct != null);
        if (nifty.length > 0) {
          chart
            .addSeries(LineSeries, { color: "#9ca3af", lineWidth: 1, lineStyle: 2, pointMarkersVisible: true })
            .setData(nifty.map((p) => ({ time: toTime(p.start), value: p.niftyReturnPct as number })));
        }
      }
      chart.timeScale().fitContent();
      onResize = () => ref.current && chart.applyOptions({ width: ref.current.clientWidth });
      window.addEventListener("resize", onResize);
    })();

    return () => {
      cancelled = true;
      if (onResize) window.removeEventListener("resize", onResize);
      if (chart) chart.remove();
    };
  }, [view, days, periods]);

  return <div ref={ref} className="w-full border border-border-custom" />;
}

// Day-by-day record of the user's REAL portfolio (broker-synced / imported /
// manual holdings — simulated trades excluded), one snapshot saved after each
// trading day's close, compared with NIFTY 50 — viewable by day, week or month.
export default function PortfolioTrackRecord() {
  const [data, setData] = useState<TrackRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("DAILY");

  useEffect(() => {
    api
      .get<TrackRecord>("/api/portfolio/track-record")
      .then(setData)
      .catch((e) => setError(e instanceof ApiRequestError ? e.message : "Failed to load your track record"))
      .finally(() => setLoading(false));
  }, []);

  const s = data?.summary;
  const periods = !data ? [] : view === "WEEKLY" ? data.weekly ?? [] : view === "MONTHLY" ? data.monthly ?? [] : [];
  const hasChartData = !data ? false : view === "DAILY" ? data.days.length >= 2 : periods.some((p) => p.returnPct != null);

  return (
    <section className="border border-border-bright bg-bg-1 overflow-hidden">
      <div className="py-[0.6rem] px-5 border-b border-border-custom bg-bg-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-col">
          <span className="font-mono text-[0.62rem] tracking-[0.18em] text-text-3 uppercase">MY TRACK RECORD</span>
          {s?.since && <span className="font-mono text-[0.55rem] text-text-4">since {s.since} · {s.daysTracked} trading day{s.daysTracked === 1 ? "" : "s"}</span>}
        </div>
        <div className="flex items-center gap-1">
          {(["DAILY", "WEEKLY", "MONTHLY"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`font-mono text-[0.58rem] px-2 py-1 border tracking-wider ${
                view === v ? "border-border-bright text-text-custom bg-bg-3" : "border-border-custom text-text-4 hover:text-text-2"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center font-mono text-xs text-text-3 py-6 animate-pulse">Loading your track record…</div>
      ) : error || !data ? (
        <div className="text-center font-mono text-xs text-text-3 py-6">{error || "Track record unavailable."}</div>
      ) : data.days.length === 0 ? (
        <div className="font-mono text-xs text-text-3 py-6 px-5 leading-relaxed text-center">
          Your first daily record is saved after today&apos;s market close (around 3:45 PM IST), then one more every trading day.
          <br />
          Only your real holdings count (Zerodha / imported) — simulated trades are left out.
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="grid grid-cols-3 gap-3 py-4 px-5 border-b border-border-custom">
            <div className="flex flex-col items-center">
              <span className={`font-mono text-lg font-bold ${tone(s!.currentPnlInr)}`}>
                {s!.currentPnlInr != null ? signedInr(s!.currentPnlInr) : "—"}
              </span>
              <span className="font-mono text-[0.52rem] text-text-3 uppercase text-center">
                Total P&amp;L{s!.currentPnlPct != null ? ` (${signed(s!.currentPnlPct)})` : ""}
              </span>
            </div>
            <div className="flex flex-col items-center">
              <span className={`font-mono text-lg font-bold ${tone(s!.portfolioReturnPct)}`}>
                {s!.portfolioReturnPct != null ? signed(s!.portfolioReturnPct) : "—"}
              </span>
              <span className="font-mono text-[0.52rem] text-text-3 uppercase text-center">My return since start</span>
            </div>
            <div className="flex flex-col items-center">
              <span className={`font-mono text-lg font-bold ${tone(s!.niftyReturnPct)}`}>
                {s!.niftyReturnPct != null ? signed(s!.niftyReturnPct) : "—"}
              </span>
              <span className="font-mono text-[0.52rem] text-text-3 uppercase text-center">NIFTY 50, same days</span>
            </div>
          </div>

          {hasChartData ? (
            <div className="p-3 border-b border-border-custom">
              <TrackChart view={view} days={data.days} periods={periods} />
              <div className="flex gap-4 justify-center mt-2 font-mono text-[0.55rem] text-text-3">
                {view === "DAILY" ? (
                  <span><span className="text-green-custom">━</span> My portfolio (total % since start)</span>
                ) : (
                  <span><span className="text-green-custom">▮</span><span className="text-red-custom">▮</span> My {view === "WEEKLY" ? "week" : "month"} %</span>
                )}
                <span><span className="text-text-3">┅</span> NIFTY 50</span>
              </div>
            </div>
          ) : (
            <div className="font-mono text-[0.62rem] text-text-3 py-3 px-5 border-b border-border-custom text-center">
              The chart appears once there are at least two trading days to compare.
            </div>
          )}

          <div className="max-h-[320px] overflow-y-auto">
            {view === "DAILY" ? (
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-bg-2">
                  <tr className="border-b border-border-custom">
                    {["Date", "Invested", "Value", "Day P&L", "Day %", "NIFTY %"].map((h, i) => (
                      <th key={h} className={`font-mono text-[0.55rem] text-text-4 uppercase tracking-wider py-2 px-3 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...data.days].reverse().map((d) => (
                    <tr key={d.date} className="border-b border-border-custom last:border-b-0 hover:bg-bg-2">
                      <td className="font-mono text-[0.62rem] text-text-2 py-2 px-3 whitespace-nowrap">{d.date}</td>
                      <td className="font-mono text-[0.62rem] text-text-2 py-2 px-3 text-right">{inr(d.investedInr)}</td>
                      <td className="font-mono text-[0.62rem] text-text-2 py-2 px-3 text-right">{inr(d.valueInr)}</td>
                      <td className={`font-mono text-[0.62rem] py-2 px-3 text-right ${tone(d.dayChangeInr)}`}>{d.dayChangeInr != null ? signedInr(d.dayChangeInr) : "—"}</td>
                      <td className={`font-mono text-[0.62rem] py-2 px-3 text-right ${tone(d.dayReturnPct)}`}>{d.dayReturnPct != null ? signed(d.dayReturnPct) : "—"}</td>
                      <td className={`font-mono text-[0.62rem] py-2 px-3 text-right ${tone(d.niftyDayReturnPct)}`}>{d.niftyDayReturnPct != null ? signed(d.niftyDayReturnPct) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-bg-2">
                  <tr className="border-b border-border-custom">
                    {[view === "WEEKLY" ? "Week" : "Month", "Value", "P&L", "My %", "NIFTY %", ""].map((h, i) => (
                      <th key={`${h}-${i}`} className={`font-mono text-[0.55rem] text-text-4 uppercase tracking-wider py-2 px-3 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...periods].reverse().map((p) => {
                    const beat = p.returnPct != null && p.niftyReturnPct != null ? p.returnPct > p.niftyReturnPct : null;
                    return (
                      <tr key={p.key} className="border-b border-border-custom last:border-b-0 hover:bg-bg-2">
                        <td className="font-mono text-[0.62rem] text-text-2 py-2 px-3 whitespace-nowrap">
                          {periodLabel(p, view)}
                          <span className="text-text-4"> · {p.tradingDays}d</span>
                        </td>
                        <td className="font-mono text-[0.62rem] text-text-2 py-2 px-3 text-right">{inr(p.endValueInr)}</td>
                        <td className={`font-mono text-[0.62rem] py-2 px-3 text-right ${tone(p.pnlChangeInr)}`}>{signedInr(p.pnlChangeInr)}</td>
                        <td className={`font-mono text-[0.62rem] py-2 px-3 text-right ${tone(p.returnPct)}`}>{p.returnPct != null ? signed(p.returnPct) : "—"}</td>
                        <td className={`font-mono text-[0.62rem] py-2 px-3 text-right ${tone(p.niftyReturnPct)}`}>{p.niftyReturnPct != null ? signed(p.niftyReturnPct) : "—"}</td>
                        <td className="font-mono text-[0.55rem] py-2 px-3 text-right whitespace-nowrap">
                          {beat == null ? "" : beat ? <span className="text-green-custom">BEAT NIFTY</span> : <span className="text-red-custom">BEHIND</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <p className="font-mono text-[0.55rem] text-text-4 leading-relaxed py-3 px-5 border-t border-border-custom">
            Saved once per trading day after the close, from your real holdings only. Buying more doesn&apos;t count as a gain — only price moves do.
            Selling at a profit shows as a dip that day (the profit leaves your holdings). Sync your broker on days you trade so the record stays accurate.
          </p>
        </div>
      )}
    </section>
  );
}
