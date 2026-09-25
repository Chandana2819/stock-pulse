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

type TrackRecord = {
  days: Day[];
  summary: {
    daysTracked: number;
    since: string | null;
    portfolioReturnPct: number | null;
    niftyReturnPct: number | null;
    currentPnlInr: number | null;
    currentPnlPct: number | null;
  };
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const signed = (n: number, suffix = "%") => `${n > 0 ? "+" : ""}${n}${suffix}`;
const tone = (n: number | null) => (n == null ? "text-text-3" : n > 0 ? "text-green-custom" : n < 0 ? "text-red-custom" : "text-text-2");

function ReturnChart({ days }: { days: Day[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || days.length < 2) return;
    let chart: any;
    let onResize: (() => void) | null = null;

    (async () => {
      const { createChart, ColorType, LineSeries } = await import("lightweight-charts");
      if (!ref.current) return;
      ref.current.innerHTML = "";
      chart = createChart(ref.current, {
        layout: { background: { type: ColorType.Solid, color: "#0a0a0f" }, textColor: "#9ca3af" },
        grid: { vertLines: { color: "#1a1a2e" }, horzLines: { color: "#1a1a2e" } },
        rightPriceScale: { borderColor: "#1a1a2e" },
        timeScale: { borderColor: "#1a1a2e" },
        width: ref.current.clientWidth,
        height: 220,
      });
      const toTime = (d: string) => Math.floor(new Date(`${d}T00:00:00Z`).getTime() / 1000) as any;
      const mine = chart.addSeries(LineSeries, { color: "#00d4aa", lineWidth: 2, title: "My portfolio %" });
      mine.setData(days.map((d) => ({ time: toTime(d.date), value: d.cumulativeReturnPct })));
      const niftyPoints = days.filter((d) => d.niftyCumulativeReturnPct != null);
      if (niftyPoints.length >= 2) {
        const nifty = chart.addSeries(LineSeries, { color: "#9ca3af", lineWidth: 1, lineStyle: 2, title: "NIFTY 50 %" });
        nifty.setData(niftyPoints.map((d) => ({ time: toTime(d.date), value: d.niftyCumulativeReturnPct as number })));
      }
      chart.timeScale().fitContent();
      onResize = () => ref.current && chart.applyOptions({ width: ref.current.clientWidth });
      window.addEventListener("resize", onResize);
    })();

    return () => {
      if (onResize) window.removeEventListener("resize", onResize);
      if (chart) chart.remove();
    };
  }, [days]);

  return <div ref={ref} className="w-full border border-border-custom" />;
}

// Day-by-day record of the user's REAL portfolio (broker-synced / imported /
// manual holdings — simulated trades excluded), one snapshot saved after each
// trading day's close, compared with NIFTY 50 over the same days.
export default function PortfolioTrackRecord() {
  const [data, setData] = useState<TrackRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<TrackRecord>("/api/portfolio/track-record")
      .then(setData)
      .catch((e) => setError(e instanceof ApiRequestError ? e.message : "Failed to load your track record"))
      .finally(() => setLoading(false));
  }, []);

  const s = data?.summary;
  const rows = data ? [...data.days].reverse() : [];

  return (
    <section className="border border-border-bright bg-bg-1 overflow-hidden">
      <div className="py-[0.6rem] px-5 border-b border-border-custom bg-bg-2 flex items-center justify-between gap-2 flex-wrap">
        <span className="font-mono text-[0.62rem] tracking-[0.18em] text-text-3 uppercase">MY DAILY TRACK RECORD</span>
        {s?.since && <span className="font-mono text-[0.55rem] text-text-4">since {s.since} · {s.daysTracked} trading day{s.daysTracked === 1 ? "" : "s"}</span>}
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
                {s!.currentPnlInr != null ? `${s!.currentPnlInr >= 0 ? "+" : "-"}${inr(Math.abs(s!.currentPnlInr))}` : "—"}
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

          {data.days.length >= 2 ? (
            <div className="p-3 border-b border-border-custom">
              <ReturnChart days={data.days} />
              <div className="flex gap-4 justify-center mt-2 font-mono text-[0.55rem] text-text-3">
                <span><span className="text-green-custom">━</span> My portfolio</span>
                <span><span className="text-text-3">┅</span> NIFTY 50</span>
              </div>
            </div>
          ) : (
            <div className="font-mono text-[0.62rem] text-text-3 py-3 px-5 border-b border-border-custom text-center">
              The chart appears from the second trading day.
            </div>
          )}

          <div className="max-h-[320px] overflow-y-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-bg-2">
                <tr className="border-b border-border-custom">
                  {["Date", "Invested", "Value", "Day P&L", "Day %", "NIFTY %"].map((h, i) => (
                    <th key={h} className={`font-mono text-[0.55rem] text-text-4 uppercase tracking-wider py-2 px-3 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.date} className="border-b border-border-custom last:border-b-0 hover:bg-bg-2">
                    <td className="font-mono text-[0.62rem] text-text-2 py-2 px-3 whitespace-nowrap">{d.date}</td>
                    <td className="font-mono text-[0.62rem] text-text-2 py-2 px-3 text-right">{inr(d.investedInr)}</td>
                    <td className="font-mono text-[0.62rem] text-text-2 py-2 px-3 text-right">{inr(d.valueInr)}</td>
                    <td className={`font-mono text-[0.62rem] py-2 px-3 text-right ${tone(d.dayChangeInr)}`}>
                      {d.dayChangeInr != null ? `${d.dayChangeInr >= 0 ? "+" : "-"}${inr(Math.abs(d.dayChangeInr))}` : "—"}
                    </td>
                    <td className={`font-mono text-[0.62rem] py-2 px-3 text-right ${tone(d.dayReturnPct)}`}>
                      {d.dayReturnPct != null ? signed(d.dayReturnPct) : "—"}
                    </td>
                    <td className={`font-mono text-[0.62rem] py-2 px-3 text-right ${tone(d.niftyDayReturnPct)}`}>
                      {d.niftyDayReturnPct != null ? signed(d.niftyDayReturnPct) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
