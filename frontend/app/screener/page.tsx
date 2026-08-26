"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/api";

type Row = {
  symbol: string;
  display: string;
  name: string;
  sector: string;
  exchange: string;
  price: number | null;
  changePct: number | null;
  marketCap: number | null;
  peRatio: number | null;
  pbRatio: number | null;
  roe: number | null;
  roce: number | null;
  debtToEquity: number | null;
  revenueGrowth: number | null;
  profitGrowth: number | null;
  dividendYield: number | null;
};

const PRESETS: { label: string; filters: Record<string, string | number> }[] = [
  { label: "Quality Compounders", filters: { roeMin: 18, debtToEquityMax: 0.5, profitGrowthMin: 10 } },
  { label: "Value Picks", filters: { peMax: 15, roeMin: 10 } },
  { label: "High Growth", filters: { revenueGrowthMin: 15, profitGrowthMin: 15 } },
  { label: "Dividend Payers", filters: { dividendYieldMin: 2 } },
  { label: "Low Debt", filters: { debtToEquityMax: 0.3 } },
];

export default function ScreenerPage() {
  const router = useRouter();
  const [sectors, setSectors] = useState<string[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<keyof Row>("marketCap");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  useEffect(() => {
    api.get<{ sectors: string[] }>("/api/screener/meta").then((d) => setSectors(d.sectors)).catch(() => {});
  }, []);

  const runScreen = useCallback(async (f: Record<string, string | number> = filters) => {
    setLoading(true);
    try {
      const query = Object.entries(f)
        .filter(([, v]) => v !== "" && v != null)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("&");
      const res = await api.get<{ results: Row[] }>(`/api/screener?${query}`);
      setRows(res.results);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    runScreen({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setField = (key: string, value: string) => setFilters((prev) => ({ ...prev, [key]: value }));

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * sortDir;
    return String(av).localeCompare(String(bv)) * sortDir;
  });

  const toggleSort = (key: keyof Row) => {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(-1);
    }
  };

  const FIELD_DEFS: { key: string; label: string; placeholder: string }[] = [
    { key: "peMax", label: "PE Max", placeholder: "e.g. 25" },
    { key: "peMin", label: "PE Min", placeholder: "e.g. 5" },
    { key: "pbMax", label: "PB Max", placeholder: "e.g. 5" },
    { key: "roeMin", label: "ROE Min %", placeholder: "e.g. 15" },
    { key: "debtToEquityMax", label: "Debt/Equity Max", placeholder: "e.g. 0.5" },
    { key: "revenueGrowthMin", label: "Revenue Growth Min %", placeholder: "e.g. 10" },
    { key: "profitGrowthMin", label: "Profit Growth Min %", placeholder: "e.g. 10" },
    { key: "dividendYieldMin", label: "Dividend Yield Min %", placeholder: "e.g. 1" },
  ];

  return (
    <div className="max-w-[1200px] mx-auto w-full p-4 sm:p-8 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl tracking-[0.1em] text-text-custom">STOCK SCREENER</h1>
        <p className="font-mono text-[0.65rem] text-text-3 mt-1">Filter the reference universe by live fundamentals & price action.</p>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => { setFilters(p.filters as any); runScreen(p.filters); }}
            className="font-mono text-[0.65rem] px-3 py-1.5 border border-border-bright text-text-2 hover:border-green-custom hover:text-green-custom hover:bg-green-dim transition-colors"
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => { setFilters({}); runScreen({}); }}
          className="font-mono text-[0.65rem] px-3 py-1.5 border border-border-custom text-text-3 hover:text-text-custom"
        >
          Clear
        </button>
      </div>

      {/* Filters */}
      <div className="border border-border-bright bg-bg-1 p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[0.55rem] text-text-3 uppercase tracking-wide">Sector</label>
          <select value={filters.sector ?? ""} onChange={(e) => setField("sector", e.target.value)} className="bg-bg-2 border border-border-custom p-2 text-xs font-mono text-text-custom outline-none">
            <option value="">All</option>
            {sectors.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        {FIELD_DEFS.map((f) => (
          <div key={f.key} className="flex flex-col gap-1">
            <label className="font-mono text-[0.55rem] text-text-3 uppercase tracking-wide">{f.label}</label>
            <input
              value={filters[f.key] ?? ""}
              onChange={(e) => setField(f.key, e.target.value)}
              placeholder={f.placeholder}
              className="bg-bg-2 border border-border-custom p-2 text-xs font-mono text-text-custom outline-none focus:border-green-custom"
            />
          </div>
        ))}
        <div className="col-span-2 sm:col-span-4 flex justify-end">
          <button onClick={() => runScreen()} className="font-mono text-xs font-bold px-5 py-2 bg-green-custom text-bg border-none cursor-pointer">
            {loading ? "SCREENING..." : "RUN SCREEN →"}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="border border-border-bright bg-bg-1 overflow-x-auto">
        <table className="w-full text-xs font-mono min-w-[900px]">
          <thead>
            <tr className="border-b border-border-custom bg-bg-2 text-text-3">
              {([
                ["display", "SYMBOL"],
                ["price", "PRICE"],
                ["changePct", "CHG%"],
                ["peRatio", "PE"],
                ["pbRatio", "PB"],
                ["roe", "ROE%"],
                ["debtToEquity", "D/E"],
                ["revenueGrowth", "REV GR%"],
                ["profitGrowth", "PROFIT GR%"],
                ["dividendYield", "DIV%"],
                ["marketCap", "MCAP"],
              ] as [keyof Row, string][]).map(([k, label]) => (
                <th key={k} onClick={() => toggleSort(k)} className="text-left p-2.5 cursor-pointer hover:text-text-custom select-none whitespace-nowrap">
                  {label} {sortKey === k ? (sortDir === 1 ? "↑" : "↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.symbol} onClick={() => router.push(`/stock/${r.symbol}`)} className="border-b border-border-custom last:border-0 hover:bg-bg-2 cursor-pointer">
                <td className="p-2.5">
                  <div className="text-text-custom font-bold">{r.display}</div>
                  <div className="text-text-4 text-[0.58rem]">{r.sector}</div>
                </td>
                <td className="p-2.5">{r.price != null ? r.price.toFixed(2) : "—"}</td>
                <td className={`p-2.5 ${r.changePct != null && r.changePct >= 0 ? "text-green-custom" : "text-red-custom"}`}>{r.changePct != null ? `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%` : "—"}</td>
                <td className="p-2.5">{r.peRatio?.toFixed(1) ?? "—"}</td>
                <td className="p-2.5">{r.pbRatio?.toFixed(1) ?? "—"}</td>
                <td className="p-2.5">{r.roe?.toFixed(1) ?? "—"}</td>
                <td className="p-2.5">{r.debtToEquity?.toFixed(2) ?? "—"}</td>
                <td className="p-2.5">{r.revenueGrowth?.toFixed(1) ?? "—"}</td>
                <td className="p-2.5">{r.profitGrowth?.toFixed(1) ?? "—"}</td>
                <td className="p-2.5">{r.dividendYield?.toFixed(1) ?? "—"}</td>
                <td className="p-2.5">{r.marketCap ? `₹${(r.marketCap / 1e7).toFixed(0)}Cr` : "—"}</td>
              </tr>
            ))}
            {sorted.length === 0 && !loading && (
              <tr>
                <td colSpan={11} className="p-8 text-center text-text-3">No stocks match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
