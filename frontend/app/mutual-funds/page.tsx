"use client";

import { useState } from "react";
import { api } from "../lib/api";

type Fund = { schemeCode: string; schemeName: string };
type FundDetail = Fund & {
  fundHouse?: string;
  category?: string;
  nav: number | null;
  navDate: string | null;
  returns: { oneMonth: number | null; sixMonth: number | null; oneYear: number | null; threeYear: number | null; fiveYear: number | null };
};

function Ret({ label, val }: { label: string; val: number | null }) {
  return (
    <div className="p-2.5 border border-border-custom bg-bg-2 text-center">
      <div className="font-mono text-[0.55rem] text-text-3 uppercase">{label}</div>
      <div className={`font-mono text-sm font-bold ${val == null ? "text-text-3" : val >= 0 ? "text-green-custom" : "text-red-custom"}`}>{val != null ? `${val >= 0 ? "+" : ""}${val.toFixed(1)}%` : "—"}</div>
    </div>
  );
}

export default function MutualFundsPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Fund[]>([]);
  const [selected, setSelected] = useState<FundDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [sip, setSip] = useState({ monthly: "5000", years: "10" });
  const [projection, setProjection] = useState<{ futureValue: number; invested: number; gain: number; assumedAnnualReturnPct: number } | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await api.get<{ results: Fund[] }>(`/api/mutual-funds/search?q=${encodeURIComponent(query)}`);
      setResults(res.results);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const select = async (f: Fund) => {
    setLoading(true);
    setProjection(null);
    try {
      const detail = await api.get<FundDetail>(`/api/mutual-funds/${f.schemeCode}`);
      setSelected(detail);
    } catch {
      setSelected(null);
    } finally {
      setLoading(false);
    }
  };

  const runSip = async () => {
    if (!selected) return;
    try {
      const p = await api.get<{ futureValue: number; invested: number; gain: number; assumedAnnualReturnPct: number }>(
        `/api/mutual-funds/${selected.schemeCode}/sip-projection?monthly=${sip.monthly}&years=${sip.years}`
      );
      setProjection(p);
    } catch {}
  };

  return (
    <div className="max-w-[900px] mx-auto w-full p-4 sm:p-8 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl tracking-[0.1em] text-text-custom">MUTUAL FUNDS</h1>
        <p className="font-mono text-[0.65rem] text-text-3 mt-1">NAV & returns sourced from the public AMFI feed — search any scheme.</p>
      </div>

      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search fund name (e.g. Parag Parikh Flexi Cap)"
          className="flex-1 bg-bg-2 border border-border-bright p-3 text-sm font-mono text-text-custom outline-none focus:border-green-custom"
        />
        <button onClick={search} className="font-mono text-xs font-bold px-5 bg-green-custom text-bg border-none cursor-pointer">{loading ? "..." : "SEARCH"}</button>
      </div>

      {results.length > 0 && !selected && (
        <div className="border border-border-bright bg-bg-1 divide-y divide-border-custom max-h-80 overflow-y-auto">
          {results.map((f) => (
            <button key={f.schemeCode} onClick={() => select(f)} className="w-full text-left p-3 text-xs font-mono text-text-2 hover:bg-bg-2 hover:text-text-custom">
              {f.schemeName}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="border border-border-bright bg-bg-1 p-6 flex flex-col gap-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-display text-xl text-text-custom">{selected.schemeName}</div>
              <div className="font-mono text-[0.6rem] text-text-3 mt-1">{selected.fundHouse} · {selected.category}</div>
            </div>
            <button onClick={() => { setSelected(null); setResults([]); }} className="text-text-3 hover:text-text-custom">✕</button>
          </div>

          <div className="flex items-baseline gap-3">
            <span className="font-mono text-2xl font-bold text-text-custom">₹{selected.nav?.toFixed(4) ?? "—"}</span>
            <span className="font-mono text-[0.6rem] text-text-3">NAV as of {selected.navDate}</span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            <Ret label="1M" val={selected.returns.oneMonth} />
            <Ret label="6M" val={selected.returns.sixMonth} />
            <Ret label="1Y" val={selected.returns.oneYear} />
            <Ret label="3Y (ann.)" val={selected.returns.threeYear} />
            <Ret label="5Y (ann.)" val={selected.returns.fiveYear} />
          </div>

          <div className="border-t border-border-custom pt-4">
            <div className="font-mono text-[0.58rem] tracking-[0.15em] text-text-3 uppercase mb-2">SIP PROJECTION</div>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="block font-mono text-[0.55rem] text-text-3">Monthly ₹</label>
                <input value={sip.monthly} onChange={(e) => setSip({ ...sip, monthly: e.target.value })} className="bg-bg-2 border border-border-custom p-2 text-xs font-mono text-text-custom outline-none w-24" />
              </div>
              <div>
                <label className="block font-mono text-[0.55rem] text-text-3">Years</label>
                <input value={sip.years} onChange={(e) => setSip({ ...sip, years: e.target.value })} className="bg-bg-2 border border-border-custom p-2 text-xs font-mono text-text-custom outline-none w-20" />
              </div>
              <button onClick={runSip} className="font-mono text-xs font-bold px-4 py-2 bg-green-custom text-bg border-none cursor-pointer">CALCULATE</button>
            </div>
            {projection && (
              <div className="grid grid-cols-3 gap-2 mt-3 text-xs font-mono">
                <div className="p-2 border border-border-custom bg-bg-2"><div className="text-text-3 text-[0.55rem]">INVESTED</div><div className="text-text-custom font-bold">₹{Math.round(projection.invested).toLocaleString("en-IN")}</div></div>
                <div className="p-2 border border-border-custom bg-bg-2"><div className="text-text-3 text-[0.55rem]">FUTURE VALUE</div><div className="text-green-custom font-bold">₹{Math.round(projection.futureValue).toLocaleString("en-IN")}</div></div>
                <div className="p-2 border border-border-custom bg-bg-2"><div className="text-text-3 text-[0.55rem]">ASSUMED RETURN</div><div className="text-text-custom font-bold">{projection.assumedAnnualReturnPct}%</div></div>
              </div>
            )}
            <div className="font-mono text-[0.55rem] text-text-4 mt-2">Projection uses the fund's own trailing return as an assumption — not a promise of future performance.</div>
          </div>
        </div>
      )}
    </div>
  );
}
