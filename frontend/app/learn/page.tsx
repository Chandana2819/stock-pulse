"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "../lib/api";

type Lesson = { id: string; title: string; level: string; track: string; summary: string; status: string };

type PracticeStock = { symbol: string; displaySymbol: string; name: string | null; sector: string; action: string };

type PredictionResult = {
  symbol: string;
  yourAction: string;
  aiAction: string | null;
  match: boolean | null;
};

const LEVEL_COLOR: Record<string, string> = { BEGINNER: "text-green-custom border-green-custom", INTERMEDIATE: "text-amber-custom border-amber-custom", ADVANCED: "text-red-custom border-red-custom" };

const VALID_ACTIONS = ["BUY", "HOLD", "SELL", "WAIT"];

// Group the finer-grained engine actions (STRONG BUY, REDUCE, ...) into the
// four calls a learner is actually asked to predict, so a practice "BUY"
// still counts as correct against an engine "STRONG BUY".
function normalizeAction(action: string): string {
  const a = action.toUpperCase();
  if (a.includes("BUY")) return "BUY";
  if (a.includes("SELL") || a === "REDUCE") return "SELL";
  if (a === "WAIT") return "WAIT";
  return "HOLD";
}

function escapeCsvField(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default function LearnPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [level, setLevel] = useState<string>("");

  const [practiceStocks, setPracticeStocks] = useState<PracticeStock[]>([]);
  const [practiceLoading, setPracticeLoading] = useState(true);
  const [results, setResults] = useState<PredictionResult[] | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<{ lessons: Lesson[] }>(`/api/learning${level ? `?level=${level}` : ""}`).then((d) => setLessons(d.lessons)).catch(() => setLessons([]));
  }, [level]);

  useEffect(() => {
    api
      .get<{ items: PracticeStock[] }>("/api/signals?exchange=NSE&sortBy=score")
      .then((d) => setPracticeStocks((d.items || []).slice(0, 15)))
      .catch(() => setPracticeStocks([]))
      .finally(() => setPracticeLoading(false));
  }, []);

  const handleDownloadTemplate = () => {
    const header = ["Symbol", "Company", "Sector", "Your Predicted Action (BUY/HOLD/SELL/WAIT)", "Notes (optional)"];
    const rows = [header];
    for (const s of practiceStocks) {
      rows.push([s.displaySymbol, s.name ?? "", s.sector, "", ""]);
    }
    const csv = rows.map((row) => row.map((cell) => escapeCsvField(String(cell))).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bullhawk-predict-practice-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleUploadClick = () => {
    setUploadError(null);
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) throw new Error("The file has no prediction rows.");

        const headers = lines[0].toLowerCase().split(",").map((h) => h.replace(/["']/g, "").trim());
        const symbolIdx = headers.findIndex((h) => h.includes("symbol"));
        const actionIdx = headers.findIndex((h) => h.includes("action"));
        if (symbolIdx === -1 || actionIdx === -1) {
          throw new Error("Could not find a Symbol column and a Predicted Action column in this file.");
        }

        const parsed: PredictionResult[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map((c) => c.replace(/["']/g, "").trim());
          const symbol = cols[symbolIdx];
          const rawAction = (cols[actionIdx] || "").toUpperCase();
          if (!symbol || !rawAction) continue;
          const yourAction = VALID_ACTIONS.find((a) => rawAction.includes(a)) ?? rawAction;

          const match = practiceStocks.find(
            (s) => s.displaySymbol.toUpperCase() === symbol.toUpperCase() || s.symbol.toUpperCase() === symbol.toUpperCase()
          );
          const aiAction = match ? normalizeAction(match.action) : null;

          parsed.push({
            symbol,
            yourAction,
            aiAction,
            match: aiAction ? aiAction === yourAction : null,
          });
        }

        if (parsed.length === 0) throw new Error("No valid rows found — fill in the Predicted Action column and try again.");
        setResults(parsed);
        setUploadError(null);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Failed to read the uploaded file.");
        setResults(null);
      }
    };
    reader.readAsText(file);
  };

  const scored = results?.filter((r) => r.aiAction !== null) ?? [];
  const correctCount = scored.filter((r) => r.match).length;
  const accuracyPct = scored.length > 0 ? Math.round((correctCount / scored.length) * 100) : null;

  return (
    <div className="max-w-[1000px] mx-auto w-full p-4 sm:p-8 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl tracking-[0.1em] text-text-custom">INVESTOR LEARNING</h1>
        <p className="font-mono text-[0.65rem] text-text-3 mt-1">Beginner → Intermediate → Advanced. Each lesson ends with a quick quiz.</p>
      </div>

      <div className="flex gap-2">
        {["", "BEGINNER", "INTERMEDIATE", "ADVANCED"].map((l) => (
          <button key={l} onClick={() => setLevel(l)} className={`font-mono text-[0.65rem] px-3 py-1.5 border ${level === l ? "border-green-custom text-green-custom bg-green-dim" : "border-border-custom text-text-3"}`}>
            {l || "ALL"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {lessons.map((l) => (
          <Link key={l.id} href={`/learn/${l.id}`} className="no-underline border border-border-bright bg-bg-1 p-5 flex flex-col gap-2 hover:border-green-custom transition-colors">
            <div className="flex items-center justify-between">
              <span className={`font-mono text-[0.55rem] px-2 py-0.5 border ${LEVEL_COLOR[l.level] ?? ""}`}>{l.level}</span>
              {l.status === "COMPLETED" && <span className="font-mono text-[0.55rem] text-green-custom">✓ DONE</span>}
            </div>
            <div className="font-display text-lg text-text-custom">{l.title}</div>
            <div className="font-mono text-[0.58rem] text-text-3 uppercase">{l.track}</div>
            <div className="text-xs text-text-2 leading-relaxed">{l.summary}</div>
          </Link>
        ))}
      </div>

      {/* Practice: Predict the Market */}
      <div className="border border-border-bright bg-bg-1 p-6 flex flex-col gap-4">
        <div>
          <h2 className="font-display text-2xl tracking-[0.1em] text-text-custom">📊 PRACTICE: PREDICT THE MARKET</h2>
          <p className="text-xs text-text-3 leading-relaxed mt-1">
            Download today's practice sheet, write your own BUY / HOLD / SELL / WAIT call for each stock based on your own research, then upload it
            back to see how your calls compare against the AI's current signal. This is a learning exercise, not investment advice.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleDownloadTemplate}
            disabled={practiceLoading || practiceStocks.length === 0}
            className="font-mono text-[0.65rem] tracking-[0.12em] bg-bg-3 border border-border-bright text-green-custom px-4 py-2 hover:bg-bg-4 disabled:opacity-50"
          >
            {practiceLoading ? "LOADING STOCKS…" : "⬇ DOWNLOAD EXCEL (CSV) TEMPLATE"}
          </button>
          <button
            onClick={handleUploadClick}
            className="font-mono text-[0.65rem] tracking-[0.12em] bg-bg-3 border border-border-bright text-text-custom px-4 py-2 hover:bg-bg-4"
          >
            ⬆ UPLOAD FILLED SHEET
          </button>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelected} />
        </div>

        {uploadError && (
          <div className="border border-red-custom bg-red-dim p-3 font-mono text-xs text-red-custom">⚠️ {uploadError}</div>
        )}

        {results && (
          <div className="flex flex-col gap-3">
            {accuracyPct !== null && (
              <div className="border border-border-custom bg-bg-2 p-4 flex items-center gap-4">
                <span className="font-mono text-3xl font-bold text-green-custom">{accuracyPct}%</span>
                <span className="font-mono text-xs text-text-3 uppercase">
                  Matched the AI's current signal on {correctCount} of {scored.length} stocks
                </span>
              </div>
            )}
            <div className="overflow-x-auto border border-border-custom">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="border-b border-border-custom text-text-3 font-mono text-[0.58rem] tracking-wider uppercase bg-bg-2">
                    <th className="py-2 px-3">Symbol</th>
                    <th className="py-2 px-2 text-center">Your Call</th>
                    <th className="py-2 px-2 text-center">AI Signal Now</th>
                    <th className="py-2 px-2 text-center">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className="border-b border-border-custom text-xs">
                      <td className="py-2 px-3 font-bold font-display">{r.symbol}</td>
                      <td className="py-2 px-2 text-center font-mono">{r.yourAction}</td>
                      <td className="py-2 px-2 text-center font-mono">{r.aiAction ?? "N/A"}</td>
                      <td className="py-2 px-2 text-center font-mono">
                        {r.match === null ? (
                          <span className="text-text-4">— symbol not in today's sheet</span>
                        ) : r.match ? (
                          <span className="text-green-custom font-bold">✓ MATCH</span>
                        ) : (
                          <span className="text-red-custom font-bold">✗ DIFFERENT</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
