"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "../lib/api";

export type SectorPerf = {
  key: string;
  label: string;
  pctChange: number | null;
  price: number | null;
};

type SignalItem = {
  symbol: string;
  displaySymbol: string;
  name: string | null;
  exchange: string;
  action: string;
  score: number;
  confidence: number;
  risk: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  sectors: SectorPerf[];
  pinned: string[];
  onTogglePin: (key: string) => void;
  initialSectorKey?: string | null;
};

const actionColor = (action: string) => {
  const a = (action || "").toUpperCase();
  if (a.includes("BUY")) return "text-green-custom border-green-custom/30 bg-green-dim/10";
  if (a.includes("SELL") || a === "REDUCE") return "text-red-custom border-red-custom/30 bg-red-dim/10";
  if (a === "HOLD") return "text-amber-custom border-amber-custom/30 bg-amber-dim/10";
  return "text-blue-custom border-blue-custom/30 bg-blue-dim/10";
};

export default function SectorExplorerModal({ isOpen, onClose, sectors, pinned, onTogglePin, initialSectorKey }: Props) {
  const router = useRouter();
  const [activeSector, setActiveSector] = useState<string | null>(initialSectorKey ?? null);
  const [stocks, setStocks] = useState<SignalItem[]>([]);
  const [loadingStocks, setLoadingStocks] = useState(false);

  useEffect(() => {
    if (isOpen) setActiveSector(initialSectorKey ?? null);
  }, [isOpen, initialSectorKey]);

  useEffect(() => {
    if (!activeSector) return;
    setLoadingStocks(true);
    fetch(`${API_BASE}/api/signals?sector=${encodeURIComponent(activeSector)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((json) => setStocks(json.items || []))
      .catch(() => setStocks([]))
      .finally(() => setLoadingStocks(false));
  }, [activeSector]);

  if (!isOpen) return null;

  const activeSectorLabel = sectors.find((s) => s.key === activeSector)?.label;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-bg-1 border border-border-bright w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-lg shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border-custom bg-bg-2 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            {activeSector && (
              <button
                onClick={() => setActiveSector(null)}
                className="font-mono text-xs text-text-3 hover:text-text-custom px-2 py-1"
              >
                ← Back
              </button>
            )}
            <span className="font-display text-base font-bold tracking-wider text-text-custom uppercase">
              {activeSector ? activeSectorLabel : "All Sectors"}
            </span>
          </div>
          <button onClick={onClose} className="text-text-3 hover:text-text-custom font-mono text-lg px-2 py-1 transition-colors">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-3">
          {!activeSector ? (
            // Manage / browse all sectors
            <>
              <p className="font-mono text-[0.65rem] text-text-3 mb-1">
                Pin up to 8 sectors to the dashboard grid ({pinned.length}/8 pinned) — remove one to pin another. Click a sector name to see its stocks.
              </p>
              {sectors.map((s) => {
                const isUp = (s.pctChange ?? 0) >= 0;
                const isPinned = pinned.includes(s.key);
                const atCapacity = !isPinned && pinned.length >= 8;
                return (
                  <div
                    key={s.key}
                    className="flex items-center justify-between border border-border-custom bg-bg-2 rounded p-3 hover:border-border-bright transition-all"
                  >
                    <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => setActiveSector(s.key)}>
                      <span className="font-mono text-sm font-bold text-text-custom">{s.label}</span>
                      <span className={`font-mono text-xs font-bold ${isUp ? "text-green-custom" : "text-red-custom"}`}>
                        {s.pctChange != null ? `${isUp ? "▲" : "▼"} ${Math.abs(s.pctChange).toFixed(2)}%` : "—"}
                      </span>
                    </div>
                    <button
                      onClick={() => !atCapacity && onTogglePin(s.key)}
                      disabled={atCapacity}
                      title={atCapacity ? "Remove a pinned sector first" : undefined}
                      className={`font-mono text-[0.6rem] px-2 py-1 rounded border transition-all ${
                        isPinned
                          ? "border-green-custom/40 text-green-custom bg-green-dim/10 hover:bg-red-dim/10 hover:border-red-custom/40 hover:text-red-custom"
                          : atCapacity
                          ? "border-border-custom text-text-4 cursor-not-allowed opacity-50"
                          : "border-border-bright text-text-2 hover:border-green-custom hover:text-green-custom"
                      }`}
                    >
                      {isPinned ? "− Remove" : "+ Pin"}
                    </button>
                  </div>
                );
              })}
            </>
          ) : loadingStocks ? (
            <div className="text-center font-mono text-xs text-text-3 py-8">Loading stocks…</div>
          ) : stocks.length === 0 ? (
            <div className="text-center font-mono text-xs text-text-3 py-8">No scanned stocks found for this sector yet.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {stocks.map((st) => (
                <div
                  key={st.symbol}
                  className="flex items-center justify-between border border-border-custom bg-bg-2 rounded p-3 hover:border-border-bright transition-all cursor-pointer"
                  onClick={() => {
                    onClose();
                    router.push(`/stock/${encodeURIComponent(st.displaySymbol)}`);
                  }}
                >
                  <div className="flex flex-col">
                    <span className="font-mono text-sm font-bold text-text-custom">{st.displaySymbol}</span>
                    {st.name && <span className="font-mono text-[0.62rem] text-text-3">{st.name}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[0.65rem] text-text-3">Score {st.score}/100</span>
                    <span className={`font-mono text-[0.65rem] font-bold px-2 py-0.5 rounded border ${actionColor(st.action)}`}>
                      {st.action}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
