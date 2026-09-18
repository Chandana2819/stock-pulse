"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiRequestError } from "../lib/api";

type ParsedRow = {
  ticker: string;
  stockName: string | null;
  price: number | null;
  signal: string | null;
  score: number | null;
  confidence: number | null;
  risk: string | null;
  entryZoneMin: number | null;
  entryZoneMax: number | null;
  stopLoss: number | null;
  targetRangeMin: number | null;
  targetRangeMax: number | null;
  reasons: string[];
  warnings: string[];
  rsi: number | null;
  macd: number | null;
  trend: string | null;
  volume: number | null;
  raw: Record<string, string>;
};

type ParsedFile = {
  fileName: string;
  headers: string[];
  mapping: Record<string, number | null>;
  rows: ParsedRow[];
  unmappedRequired: string[];
};

type DailyImportSummary = { id: string; fileName: string; tradingDate: string; rowCount: number; status: string; createdAt: string };

type HoldingReview = {
  ticker: string;
  displaySym: string;
  exchange: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number | null;
  pl: number | null;
  plPct: number | null;
  monthlyChangePct: number | null;
  signalTrend: { mostFrequent: string; changes: number; counts: Record<string, number> } | null;
  avgScore: number | null;
  avgConfidence: number | null;
  currentRisk: string | null;
};

const COLUMN_KEYWORDS: Record<string, string[]> = {
  ticker: ["ticker", "symbol", "stock", "scrip"],
  stockName: ["company", "name", "stock name"],
  price: ["price", "ltp", "close", "cmp"],
  signal: ["signal", "action", "recommendation", "call"],
  score: ["score"],
  confidence: ["confidence"],
  risk: ["risk"],
  entryZone: ["entry zone", "entry"],
  stopLoss: ["stop loss", "stop-loss", "stoploss"],
  targetRange: ["target range", "target"],
  reasons: ["reason", "justification"],
  warnings: ["warning"],
  rsi: ["rsi"],
  macd: ["macd"],
  trend: ["trend"],
  volume: ["volume", "vol"],
};

const REQUIRED_FIELDS = ["ticker"];

function parseCsvText(fileName: string, text: string): ParsedFile {
  const lines = text.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("The file has a header row but no data rows.");

  const splitLine = (line: string) => line.split(",").map((c) => c.replace(/^["']|["']$/g, "").trim());
  const headers = splitLine(lines[0]);
  const headersLower = headers.map((h) => h.toLowerCase());

  const mapping: Record<string, number | null> = {};
  for (const field of Object.keys(COLUMN_KEYWORDS)) {
    const idx = headersLower.findIndex((h) => COLUMN_KEYWORDS[field].some((kw) => h.includes(kw)));
    mapping[field] = idx === -1 ? null : idx;
  }

  // "name" is a shared, low-specificity keyword — don't let it steal the ticker column's index.
  if (mapping.stockName === mapping.ticker) mapping.stockName = null;

  const unmappedRequired = REQUIRED_FIELDS.filter((f) => mapping[f] == null);

  const rows: ParsedRow[] = [];
  if (unmappedRequired.length === 0) {
    for (let i = 1; i < lines.length; i++) {
      const cols = splitLine(lines[i]);
      const ticker = mapping.ticker != null ? cols[mapping.ticker] : "";
      if (!ticker) continue;
      const raw: Record<string, string> = {};
      headers.forEach((h, idx) => (raw[h] = cols[idx] ?? ""));
      const num = (idx: number | null) => {
        if (idx == null) return null;
        const n = parseFloat(cols[idx]);
        return Number.isFinite(n) ? n : null;
      };
      const strOrNull = (idx: number | null) => (idx != null && cols[idx] ? cols[idx] : null);
      const range = (idx: number | null): [number | null, number | null] => {
        const v = strOrNull(idx);
        if (!v || !v.includes("-")) return [null, null];
        const [a, b] = v.split("-").map((s) => parseFloat(s.trim()));
        return [Number.isFinite(a) ? a : null, Number.isFinite(b) ? b : null];
      };
      const listOf = (idx: number | null): string[] => {
        const v = strOrNull(idx);
        return v ? v.split(";").map((s) => s.trim()).filter(Boolean) : [];
      };

      const [entryZoneMin, entryZoneMax] = range(mapping.entryZone);
      const [targetRangeMin, targetRangeMax] = range(mapping.targetRange);

      rows.push({
        ticker: ticker.toUpperCase(),
        stockName: strOrNull(mapping.stockName),
        price: num(mapping.price),
        signal: strOrNull(mapping.signal),
        score: num(mapping.score),
        confidence: num(mapping.confidence),
        risk: strOrNull(mapping.risk),
        entryZoneMin,
        entryZoneMax,
        stopLoss: num(mapping.stopLoss),
        targetRangeMin,
        targetRangeMax,
        reasons: listOf(mapping.reasons),
        warnings: listOf(mapping.warnings),
        rsi: num(mapping.rsi),
        macd: num(mapping.macd),
        trend: strOrNull(mapping.trend),
        volume: num(mapping.volume),
        raw,
      });
    }
  }

  return { fileName, headers, mapping, rows, unmappedRequired };
}

export default function StockLearningPage() {
  const [imports, setImports] = useState<DailyImportSummary[]>([]);
  const [holdings, setHoldings] = useState<HoldingReview[]>([]);
  const [loading, setLoading] = useState(true);

  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [tradingDate, setTradingDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [logicVersion, setLogicVersion] = useState<string>("v1");
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [impRes, holdRes] = await Promise.all([
        api.get<{ imports: DailyImportSummary[]; lastUpload: DailyImportSummary | null }>("/api/stock-learning/daily-imports"),
        api.get<{ holdings: HoldingReview[] }>("/api/stock-learning/holdings-review"),
      ]);
      setImports(impRes.imports);
      setHoldings(holdRes.holdings);
    } catch {
      setImports([]);
      setHoldings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setParseError(null);
    setImportMessage(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        setParsed(parseCsvText(file.name, text));
      } catch (err) {
        setParseError(err instanceof Error ? err.message : "Failed to read the file.");
        setParsed(null);
      }
    };
    reader.readAsText(file);
  };

  const confirmImport = async (replace = false) => {
    if (!parsed) return;
    setImporting(true);
    setImportMessage(null);
    try {
      const res = await api.post<{ success: boolean; rowCount: number; replaced: boolean }>("/api/stock-learning/daily-import", {
        fileName: parsed.fileName,
        tradingDate,
        replace,
        logicVersion,
        rows: parsed.rows,
      });
      setImportMessage(`Imported ${res.rowCount} rows for ${tradingDate}${res.replaced ? " (replaced previous upload for this date)" : ""}.`);
      setParsed(null);
      await loadAll();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) {
        const ok = confirm(`${err.message}\n\nReplace the existing upload for ${tradingDate} with this file?`);
        if (ok) return confirmImport(true);
        setImportMessage("Import cancelled — existing data for this date was kept.");
      } else if (err instanceof ApiRequestError && err.status === 401) {
        // This page has no login form — a 401 here means the server couldn't
        // verify the request (commonly a transient backend/database issue),
        // not that the user is missing a sign-in step. Say that plainly
        // instead of surfacing the generic "Sign in to continue" wording.
        setImportMessage("Upload failed — the server couldn't verify this request. This is usually temporary; wait a moment and try again.");
      } else {
        setImportMessage(err instanceof ApiRequestError ? err.message : "Import failed.");
      }
    } finally {
      setImporting(false);
    }
  };

  const lastUpload = imports[0] ?? null;

  return (
    <div className="max-w-[1200px] mx-auto w-full p-4 sm:p-8 flex flex-col gap-8">
      <div className="border border-border-bright bg-bg-1 p-6 flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl tracking-[0.1em] text-text-custom">STOCK LEARNING &amp; MONTHLY REVIEW</h1>
            <p className="text-xs text-text-3 leading-relaxed max-w-3xl mt-1">
              Upload the daily StockSignals export you download each day. Every upload is kept — nothing is overwritten — building a historical record
              you can review stock-by-stock and month-by-month for the stocks you actually hold.
            </p>
          </div>
          <Link
            href="/stock-learning/predictions"
            className="font-mono text-[0.65rem] tracking-[0.12em] bg-bg-3 border border-border-bright text-text-custom px-4 py-2 hover:bg-bg-4 whitespace-nowrap"
          >
            📊 PREDICTION ACCURACY DASHBOARD →
          </Link>
        </div>
        <p className="text-[0.62rem] text-text-4 font-mono">
          Reviewing your own holdings? Stay here. Evaluating how accurate every BullHawk prediction actually was against real market prices? Use the dashboard above.
        </p>
      </div>

      {/* Upload */}
      <div className="border border-border-bright bg-bg-1 p-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl tracking-[0.08em] text-text-custom">Upload Daily Excel</h2>
            <p className="font-mono text-[0.65rem] text-text-3 mt-1">
              Last Upload:{" "}
              {lastUpload ? (
                <span className="text-green-custom font-bold">{new Date(lastUpload.tradingDate).toLocaleDateString("en-IN")} · {lastUpload.rowCount} stocks</span>
              ) : (
                <span className="text-amber-custom">No uploads yet</span>
              )}
            </p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="font-mono text-[0.65rem] tracking-[0.12em] bg-bg-3 border border-border-bright text-green-custom px-4 py-2 hover:bg-bg-4"
          >
            ⬆ UPLOAD DAILY EXCEL (CSV)
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileSelected} />
        </div>

        {parseError && <div className="border border-red-custom bg-red-dim p-3 font-mono text-xs text-red-custom">⚠️ {parseError}</div>}
        {importMessage && <div className="border border-border-custom bg-bg-2 p-3 font-mono text-xs text-text-2">{importMessage}</div>}

        {/* Preview before import */}
        {parsed && (
          <div className="border border-amber-custom bg-bg-2 p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-mono text-xs text-amber-custom uppercase tracking-wider">Preview — {parsed.fileName}</span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="font-mono text-[0.6rem] text-text-3 uppercase">Trading Date</label>
                  <input
                    type="date"
                    value={tradingDate}
                    onChange={(e) => setTradingDate(e.target.value)}
                    className="font-mono text-xs bg-bg border border-border-custom text-text-2 px-2 py-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="font-mono text-[0.6rem] text-text-3 uppercase" title="Which version of your prediction logic generated this file">Logic Version</label>
                  <input
                    type="text"
                    value={logicVersion}
                    onChange={(e) => setLogicVersion(e.target.value)}
                    className="font-mono text-xs bg-bg border border-border-custom text-text-2 px-2 py-1 w-16"
                  />
                </div>
              </div>
            </div>

            {parsed.unmappedRequired.length > 0 ? (
              <div className="border border-red-custom bg-red-dim p-3 font-mono text-xs text-red-custom">
                ⚠️ Could not find a Symbol/Ticker column in this file. Detected headers: {parsed.headers.join(", ") || "(none)"}
              </div>
            ) : (
              <>
                <div className="font-mono text-[0.6rem] text-text-3">
                  Detected {parsed.rows.length} stock rows. Columns mapped: Ticker, {parsed.mapping.stockName != null ? "Company, " : ""}
                  {parsed.mapping.price != null ? "Price, " : ""}
                  {parsed.mapping.signal != null ? "Signal, " : ""}
                  {parsed.mapping.score != null ? "Score, " : ""}
                  {parsed.mapping.rsi != null ? "RSI, " : ""}
                  {parsed.mapping.macd != null ? "MACD, " : ""}
                  {parsed.mapping.trend != null ? "Trend, " : ""}
                  {parsed.mapping.volume != null ? "Volume" : ""}
                </div>
                <div className="overflow-x-auto border border-border-custom max-h-64 overflow-y-auto">
                  <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead className="sticky top-0 bg-bg-2">
                      <tr className="font-mono text-[0.58rem] text-text-3 uppercase border-b border-border-custom">
                        <th className="py-2 px-2">Ticker</th>
                        <th className="py-2 px-2">Price</th>
                        <th className="py-2 px-2">Signal</th>
                        <th className="py-2 px-2">Score</th>
                        <th className="py-2 px-2">RSI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.slice(0, 10).map((r, i) => (
                        <tr key={i} className="text-xs border-b border-border-custom">
                          <td className="py-1.5 px-2 font-bold">{r.ticker}</td>
                          <td className="py-1.5 px-2">{r.price ?? "—"}</td>
                          <td className="py-1.5 px-2">{r.signal ?? "—"}</td>
                          <td className="py-1.5 px-2">{r.score ?? "—"}</td>
                          <td className="py-1.5 px-2">{r.rsi ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsed.rows.length > 10 && <div className="font-mono text-[0.58rem] text-text-4 p-2">…and {parsed.rows.length - 10} more rows</div>}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => confirmImport(false)}
                    disabled={importing || parsed.rows.length === 0}
                    className="font-mono text-[0.62rem] tracking-wider bg-green-dim border border-green-custom text-green-custom px-4 py-2 hover:bg-bg-4 disabled:opacity-50"
                  >
                    {importing ? "IMPORTING…" : `CONFIRM IMPORT (${parsed.rows.length} ROWS)`}
                  </button>
                  <button
                    onClick={() => setParsed(null)}
                    className="font-mono text-[0.62rem] tracking-wider border border-border-custom text-text-3 px-4 py-2 hover:bg-bg-3"
                  >
                    CANCEL
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Portfolio Holdings */}
      <div className="border border-border-bright bg-bg-1 p-6 flex flex-col gap-4">
        <h2 className="font-display text-xl tracking-[0.08em] text-text-custom">Portfolio Holdings — Close-Up Review</h2>
        {loading ? (
          <div className="font-mono text-xs text-text-3 animate-pulse py-6 text-center">Loading holdings…</div>
        ) : holdings.length === 0 ? (
          <div className="border border-border-custom bg-bg-2 p-6 text-center text-xs text-text-3 font-mono">
            No holdings on record. Add stocks in <Link href="/portfolio" className="text-green-custom underline">Portfolio</Link> to see them here.
          </div>
        ) : (
          <div className="overflow-x-auto border border-border-custom">
            <table className="w-full text-left border-collapse min-w-[950px]">
              <thead>
                <tr className="border-b border-border-custom text-text-3 font-mono text-[0.58rem] tracking-wider uppercase bg-bg-2">
                  <th className="py-2 px-3">Stock</th>
                  <th className="py-2 px-2 text-right">Price</th>
                  <th className="py-2 px-2 text-right">My P&amp;L</th>
                  <th className="py-2 px-2 text-right">Monthly Change</th>
                  <th className="py-2 px-2 text-center">Signal Trend</th>
                  <th className="py-2 px-2 text-right">Avg Score</th>
                  <th className="py-2 px-2 text-right">Confidence</th>
                  <th className="py-2 px-2 text-center">Risk</th>
                  <th className="py-2 px-2 text-center">Close-Up</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <tr key={h.ticker} className="border-b border-border-custom text-xs hover:bg-bg-2">
                    <td className="py-2.5 px-3 font-bold font-display">{h.displaySym}</td>
                    <td className="py-2.5 px-2 text-right font-mono">{h.currentPrice != null ? `₹${h.currentPrice.toFixed(2)}` : "—"}</td>
                    <td className={`py-2.5 px-2 text-right font-mono font-bold ${h.pl != null && h.pl >= 0 ? "text-green-custom" : "text-red-custom"}`}>
                      {h.pl != null ? `${h.pl >= 0 ? "+" : ""}₹${h.pl.toFixed(2)}` : "—"}
                    </td>
                    <td className={`py-2.5 px-2 text-right font-mono ${h.monthlyChangePct != null && h.monthlyChangePct >= 0 ? "text-green-custom" : "text-red-custom"}`}>
                      {h.monthlyChangePct != null ? `${h.monthlyChangePct >= 0 ? "+" : ""}${h.monthlyChangePct.toFixed(2)}%` : "No data uploaded this month"}
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono">
                      {h.signalTrend ? (
                        <span title={Object.entries(h.signalTrend.counts).map(([s, c]) => `${s}: ${c}d`).join(", ")}>
                          Mostly {h.signalTrend.mostFrequent} · {h.signalTrend.changes} change{h.signalTrend.changes === 1 ? "" : "s"}
                        </span>
                      ) : (
                        "No uploaded signal"
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono">{h.avgScore != null ? `${h.avgScore.toFixed(0)}/100` : "—"}</td>
                    <td className="py-2.5 px-2 text-right font-mono">{h.avgConfidence != null ? `${h.avgConfidence.toFixed(0)}%` : "—"}</td>
                    <td className="py-2.5 px-2 text-center font-mono">{h.currentRisk ?? "—"}</td>
                    <td className="py-2.5 px-2 text-center">
                      <Link
                        href={`/stock-learning/${encodeURIComponent(h.ticker)}`}
                        className="font-mono text-[0.6rem] tracking-wider border border-border-bright text-text-custom px-2.5 py-1 hover:bg-bg-3"
                      >
                        CLOSE-UP →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload history */}
      <div className="border border-border-bright bg-bg-1 p-6 flex flex-col gap-4">
        <h2 className="font-display text-xl tracking-[0.08em] text-text-custom">Upload History</h2>
        {imports.length === 0 ? (
          <div className="font-mono text-xs text-text-3">No files uploaded yet.</div>
        ) : (
          <div className="overflow-x-auto border border-border-custom max-h-64 overflow-y-auto">
            <table className="w-full text-left border-collapse min-w-[500px]">
              <thead className="sticky top-0 bg-bg-2">
                <tr className="font-mono text-[0.58rem] text-text-3 uppercase border-b border-border-custom">
                  <th className="py-2 px-3">Trading Date</th>
                  <th className="py-2 px-2">File</th>
                  <th className="py-2 px-2 text-right">Rows</th>
                  <th className="py-2 px-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((imp) => (
                  <tr key={imp.id} className="text-xs border-b border-border-custom">
                    <td className="py-2 px-3 font-mono">{new Date(imp.tradingDate).toLocaleDateString("en-IN")}</td>
                    <td className="py-2 px-2 font-mono text-text-3">{imp.fileName}</td>
                    <td className="py-2 px-2 text-right font-mono">{imp.rowCount}</td>
                    <td className="py-2 px-2 text-center font-mono text-green-custom">{imp.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
