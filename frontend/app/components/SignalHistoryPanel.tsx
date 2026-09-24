"use client";

import { useEffect, useState, useCallback } from "react";
import { api, ApiRequestError } from "../lib/api";

type HorizonResult = {
  price: number | null;
  returnPct: number | null;
  result: "WIN" | "LOSS" | "STABLE" | "UNSTABLE" | "PENDING" | "NOT_SCORED";
};

type HistoryEntry = {
  date: string;
  action: string;
  score: number;
  confidence: number;
  entryPrice: number | null;
  horizons: { d5: HorizonResult; d10: HorizonResult; d20: HorizonResult };
};

export type SymbolSignalHistory = {
  symbol: string;
  windowDays: number;
  entries: HistoryEntry[];
  summary: {
    totalSignals: number;
    scored: { d5: number; d10: number; d20: number };
    accuracyPct: { d5: number | null; d10: number | null; d20: number | null };
  };
};

const PERIODS: { label: string; days: number }[] = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
];

function resultStyle(result: HorizonResult["result"]): string {
  switch (result) {
    case "WIN":
      return "text-green-custom border-green-custom bg-green-dim";
    case "LOSS":
      return "text-red-custom border-red-custom bg-red-dim";
    case "STABLE":
      return "text-blue-custom border-blue-custom bg-blue-dim";
    case "UNSTABLE":
      return "text-amber-custom border-amber-custom bg-amber-dim";
    case "PENDING":
      return "text-text-3 border-border-custom";
    default: // NOT_SCORED
      return "text-text-4 border-border-custom";
  }
}

function actionStyle(action: string): string {
  if (action.includes("BUY")) return "text-green-custom border-green-custom bg-green-dim";
  if (action.includes("SELL") || action === "REDUCE") return "text-red-custom border-red-custom bg-red-dim";
  if (action === "HOLD") return "text-blue-custom border-blue-custom bg-blue-dim";
  return "text-amber-custom border-amber-custom bg-amber-dim";
}

function HorizonCell({ h }: { h: HorizonResult }) {
  if (h.result === "NOT_SCORED") {
    return <span className="text-text-4">—</span>;
  }
  if (h.result === "PENDING") {
    return <span className={`inline-block px-1.5 py-[1px] border font-mono text-[0.58rem] ${resultStyle(h.result)}`}>PENDING</span>;
  }
  return (
    <div className="flex flex-col items-start gap-[2px]">
      <span className={`inline-block px-1.5 py-[1px] border font-mono text-[0.58rem] ${resultStyle(h.result)}`}>{h.result}</span>
      <span className="font-mono text-[0.6rem] text-text-3">
        {h.returnPct != null ? `${h.returnPct > 0 ? "+" : ""}${h.returnPct}%` : "—"}
      </span>
    </div>
  );
}

// This is the "did what it told me actually happen" view: every past dated
// call the engine made for this stock, checked against the real closing
// price 5 / 10 / 20 trading days later. Same win/loss rule as the Track
// Record tab's "live" section (return direction has to match the call),
// just broken out day by day for one symbol instead of rolled into one
// aggregate percentage.
export default function SignalHistoryPanel({ symbol }: { symbol: string }) {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<SymbolSignalHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<SymbolSignalHistory>(
        `/api/signals/history/outcomes?symbol=${encodeURIComponent(symbol)}&days=${days}`
      );
      setData(res);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Failed to load signal history");
    } finally {
      setLoading(false);
    }
  }, [symbol, days]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="border border-border-bright bg-bg-1 overflow-hidden">
      <div className="py-[0.6rem] px-6 border-b border-border-custom bg-bg-2 flex items-center gap-3 flex-wrap justify-between">
        <span className="font-mono text-[0.62rem] tracking-[0.18em] text-text-3 uppercase">SIGNAL HISTORY · {symbol}</span>
        <div className="flex items-center gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.label}
              onClick={() => setDays(p.days)}
              className={`font-mono text-[0.6rem] px-2 py-1 border tracking-wider ${
                days === p.days ? "border-border-bright text-text-1 bg-bg-3" : "border-border-custom text-text-4 hover:text-text-2"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center font-mono text-xs text-text-3 py-6">Loading history…</div>
      ) : error || !data ? (
        <div className="text-center font-mono text-xs text-text-3 py-6">{error || "Signal history unavailable."}</div>
      ) : data.entries.length === 0 ? (
        <div className="text-center font-mono text-xs text-text-3 py-6 px-6">
          No signal history yet for {symbol} in this window. History builds up as the scanner keeps running — check back after it's had time to log a few calls.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 flex-wrap py-[0.6rem] px-6 border-b border-border-custom bg-bg-2">
            <span className="font-mono text-[0.6rem] text-text-4 uppercase tracking-wider">
              {data.summary.totalSignals} signal{data.summary.totalSignals === 1 ? "" : "s"} logged
            </span>
            {(["d5", "d10", "d20"] as const).map((k, i) => (
              <span key={k} className="font-mono text-[0.6rem] text-text-3">
                {["5D", "10D", "20D"][i]}:{" "}
                <span className={data.summary.accuracyPct[k] != null ? "text-text-1 font-bold" : "text-text-4"}>
                  {data.summary.accuracyPct[k] != null ? `${data.summary.accuracyPct[k]}%` : "—"}
                </span>{" "}
                <span className="text-text-4">({data.summary.scored[k]} scored)</span>
              </span>
            ))}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-bg-2 z-[1]">
                <tr className="border-b border-border-custom">
                  <th className="text-left font-mono text-[0.58rem] text-text-4 uppercase tracking-wider py-2 px-4">Date</th>
                  <th className="text-left font-mono text-[0.58rem] text-text-4 uppercase tracking-wider py-2 px-2">Signal</th>
                  <th className="text-right font-mono text-[0.58rem] text-text-4 uppercase tracking-wider py-2 px-2">Entry ₹</th>
                  <th className="text-left font-mono text-[0.58rem] text-text-4 uppercase tracking-wider py-2 px-2">+5D</th>
                  <th className="text-left font-mono text-[0.58rem] text-text-4 uppercase tracking-wider py-2 px-2">+10D</th>
                  <th className="text-left font-mono text-[0.58rem] text-text-4 uppercase tracking-wider py-2 px-4">+20D</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.date} className="border-b border-border-custom last:border-b-0 hover:bg-bg-2">
                    <td className="font-mono text-[0.65rem] text-text-2 py-2 px-4 whitespace-nowrap">{e.date}</td>
                    <td className="py-2 px-2">
                      <span className={`inline-block px-1.5 py-[1px] border font-mono text-[0.6rem] font-bold ${actionStyle(e.action)}`}>
                        {e.action}
                      </span>
                    </td>
                    <td className="text-right font-mono text-[0.65rem] text-text-2 py-2 px-2 whitespace-nowrap">
                      {e.entryPrice != null ? `₹${e.entryPrice.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-2 px-2"><HorizonCell h={e.horizons.d5} /></td>
                    <td className="py-2 px-2"><HorizonCell h={e.horizons.d10} /></td>
                    <td className="py-2 px-4"><HorizonCell h={e.horizons.d20} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
