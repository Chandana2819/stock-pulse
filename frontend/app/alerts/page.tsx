"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api, ApiRequestError } from "../lib/api";

type Alert = { id: string; symbol: string | null; type: string; threshold: number | null; active: boolean; note: string | null; triggerCount: number };
type WatchItem = { symbol: string; note: string | null; targetPrice: number | null; price: number | null; changePct: number | null; alert: string | null };

const ALERT_TYPES = ["PRICE_ABOVE", "PRICE_BELOW", "PCT_MOVE", "VOLUME_SPIKE", "RSI_ABOVE", "RSI_BELOW"];

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [watch, setWatch] = useState<WatchItem[]>([]);
  const [form, setForm] = useState({ symbol: "", type: "PCT_MOVE", threshold: "3" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, w] = await Promise.all([
        api.get<Alert[]>("/api/alerts"),
        api.get<{ items: WatchItem[] }>("/api/watchlist/enriched"),
      ]);
      setAlerts(a);
      setWatch(w.items);
    } catch {}
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createAlert = async () => {
    setError(null);
    try {
      await api.post("/api/alerts", { symbol: form.symbol || undefined, type: form.type, threshold: Number(form.threshold) });
      setForm({ symbol: "", type: "PCT_MOVE", threshold: "3" });
      load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Failed to create alert");
    }
  };

  const toggleAlert = async (a: Alert) => {
    await api.put(`/api/alerts/${a.id}`, { active: !a.active });
    load();
  };

  const deleteAlert = async (id: string) => {
    await api.del(`/api/alerts/${id}`);
    load();
  };

  return (
    <div className="max-w-[1000px] mx-auto w-full p-4 sm:p-8 flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl tracking-[0.1em] text-text-custom">ALERT CENTER</h1>
        <p className="font-mono text-[0.65rem] text-text-3 mt-1">Price, movement, volume and RSI alerts — checked automatically every couple of minutes.</p>
      </div>

      {/* Create */}
      <div className="border border-border-bright bg-bg-1 p-5 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[0.55rem] text-text-3 uppercase">Symbol</label>
          <input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} placeholder="TCS.NS" className="bg-bg-2 border border-border-custom p-2 text-xs font-mono text-text-custom outline-none w-32" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[0.55rem] text-text-3 uppercase">Type</label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="bg-bg-2 border border-border-custom p-2 text-xs font-mono text-text-custom outline-none">
            {ALERT_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[0.55rem] text-text-3 uppercase">Threshold</label>
          <input value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} className="bg-bg-2 border border-border-custom p-2 text-xs font-mono text-text-custom outline-none w-24" />
        </div>
        <button onClick={createAlert} className="font-mono text-xs font-bold px-4 py-2 bg-green-custom text-bg border-none cursor-pointer">+ CREATE ALERT</button>
        {error && <div className="font-mono text-xs text-red-custom w-full">{error}</div>}
      </div>

      {/* List */}
      <div className="border border-border-bright bg-bg-1 divide-y divide-border-custom">
        {alerts.length === 0 && <div className="p-6 text-center font-mono text-xs text-text-3">No alerts yet.</div>}
        {alerts.map((a) => (
          <div key={a.id} className="flex items-center justify-between p-3 gap-3">
            <div className="font-mono text-xs">
              <span className="text-text-custom font-bold">{a.symbol ?? "MARKET"}</span>
              <span className="text-text-3"> · {a.type.replace(/_/g, " ")}{a.threshold != null ? ` ${a.threshold}` : ""}</span>
              {a.triggerCount > 0 && <span className="text-amber-custom"> · triggered {a.triggerCount}x</span>}
            </div>
            <div className="flex gap-2 items-center">
              <button onClick={() => toggleAlert(a)} className={`font-mono text-[0.6rem] px-2 py-1 border ${a.active ? "border-green-custom text-green-custom" : "border-border-custom text-text-3"}`}>
                {a.active ? "ACTIVE" : "PAUSED"}
              </button>
              <button onClick={() => deleteAlert(a.id)} className="text-text-3 hover:text-red-custom text-xs">✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Watchlist intelligence */}
      <div>
        <h2 className="font-display text-xl tracking-[0.08em] text-text-custom mb-3">WATCHLIST INTELLIGENCE</h2>
        {watch.length === 0 ? (
          <div className="border border-border-custom bg-bg-1 p-8 text-center font-mono text-xs text-text-3">Your watchlist is empty. Add stocks from any stock page.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {watch.map((w) => (
              <Link key={w.symbol} href={`/stock/${w.symbol}`} className="no-underline border border-border-bright bg-bg-1 p-4 flex flex-col gap-1 hover:border-green-custom">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-text-custom">{w.symbol.replace(/\.(NS|BO)$/, "")}</span>
                  <span className="font-mono text-sm">{w.price != null ? w.price.toFixed(2) : "—"}</span>
                </div>
                {w.changePct != null && (
                  <span className={`font-mono text-xs ${w.changePct >= 0 ? "text-green-custom" : "text-red-custom"}`}>
                    {w.changePct >= 0 ? "▲" : "▼"} {Math.abs(w.changePct).toFixed(2)}%
                  </span>
                )}
                {w.alert && <span className="font-mono text-[0.6rem] text-amber-custom">⚡ {w.alert}</span>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
