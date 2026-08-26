"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "../lib/api";

type IndexPoint = { symbol: string; price: number | null; prevClose: number | null; pctChange: number | null };
type RiskFactor = { key: string; label: string; score: number | null; available: boolean; detail: string };
type RiskResult = {
  score: number;
  classification: string;
  statusEmoji: string;
  factors: RiskFactor[];
  reasons: string[];
};
type MarketData = {
  indices: IndexPoint[];
  risk: RiskResult | null;
  dataCompleteness: string;
};

function fmt(n: number | null, currency = false) {
  if (n == null) return "—";
  return currency ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : n.toFixed(2);
}

export default function MarketOverview() {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/market`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        // leave data as-is; UI shows last-known or empty state
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const risk = data?.risk;

  return (
    <section className="mb-6">
      <div className="font-mono text-[1rem] tracking-[0.15em] text-text-3 uppercase font-bold">{"MARKET OVERVIEW"}</div>

      {/* Real index ticker, replacing static demo values */}
      <div className="relative bg-bg-1 border border-border-custom px-4 h-9 flex items-center gap-8 overflow-hidden rounded-lg mt-2 mb-3">
        {/* Gradient fade overlays */}
        <div className="absolute left-0 top-0 w-[60px] h-full bg-gradient-to-r from-bg-1 to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 w-[60px] h-full bg-gradient-to-l from-bg-1 to-transparent z-10 pointer-events-none" />
        <div className="animate-ticker-scroll flex gap-10 whitespace-nowrap shrink-0">
          {(data?.indices ?? []).concat(data?.indices ?? []).map((item, i) => (
            <div key={i} className="flex items-center gap-[0.4rem] font-mono text-[0.82rem] tracking-[0.05em] text-text-2">
              <span className="text-text-custom font-bold">{item.symbol}</span>
              <span>{fmt(item.price, true)}</span>
              <span className={item.pctChange != null && item.pctChange >= 0 ? "text-green-custom" : "text-red-custom"}>
                {item.pctChange == null ? "—" : `${item.pctChange >= 0 ? "▲" : "▼"} ${Math.abs(item.pctChange).toFixed(2)}%`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {loading && !risk ? (
        <div className="flex items-center gap-2 font-mono text-[0.8rem] text-text-3 tracking-[0.05em] py-[0.4rem] border-t border-b border-border-custom"><span>Loading market risk…</span></div>
      ) : risk ? (
        <div
          className="flex flex-col items-start gap-2 cursor-pointer font-mono text-[0.8rem] text-text-3 tracking-[0.05em] py-2 border-t border-b border-border-custom w-full"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-[10px] w-full">
            <span className="text-[18px]">{risk.statusEmoji}</span>
            <span className="font-mono text-[0.72rem] tracking-[0.18em] text-text-3 uppercase font-bold">MARKET RISK</span>
            <span className="text-text-2 text-[16px]">{risk.score} / 100</span>
            <span className="text-text-custom">{risk.classification}</span>
            <span className="text-text-4 mx-1">·</span>
            <span className="text-[12px] opacity-60">{data?.dataCompleteness}</span>
            <span className="text-[12px] opacity-60">{expanded ? "▲ hide factors" : "▼ show factors"}</span>
          </div>

          <div className="text-[14px] opacity-85 text-text-2">
            {risk.reasons.join(" · ")}
          </div>

          {expanded && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2 w-full mt-1" onClick={(e) => e.stopPropagation()}>
              {risk.factors.map((f) => (
                <div key={f.key} className="flex flex-col items-start gap-[2px] p-[0.65rem_1.25rem] border-b border-border-custom last:border-b-0">
                  <span className="font-mono text-[0.72rem] tracking-[0.18em] text-text-3 uppercase font-bold">{f.label}</span>
                  <span className="text-sm text-text-2 leading-[1.4]">
                    {f.available && f.score != null ? Math.round(f.score) : "N/A"}
                  </span>
                  <span className="text-[11px] opacity-60 text-text-3">{f.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 font-mono text-[0.8rem] text-text-3 tracking-[0.05em] py-[0.4rem] border-t border-b border-border-custom"><span>Market risk data unavailable right now.</span></div>
      )}
    </section>
  );
}
