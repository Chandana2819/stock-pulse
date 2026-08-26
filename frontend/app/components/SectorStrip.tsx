"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Sector = { key: string; label: string; pctChange: number | null };

export default function SectorStrip() {
  const [sectors, setSectors] = useState<Sector[]>([]);

  useEffect(() => {
    api.get<{ sectors: Sector[] }>("/api/market/sectors").then((d) => setSectors(d.sectors)).catch(() => setSectors([]));
  }, []);

  if (sectors.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <div className="font-mono text-[1rem] tracking-[0.15em] text-text-3 uppercase font-bold">{"SECTOR PERFORMANCE"}</div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {sectors.map((s) => (
          <div key={s.key} className="shrink-0 min-w-[120px] p-2.5 border border-border-custom bg-bg-1 text-center">
            <div className="font-mono text-[0.75rem] text-text-2 truncate">{s.label}</div>
            <div className={`font-mono text-[0.95rem] font-bold ${s.pctChange == null ? "text-text-3" : s.pctChange >= 0 ? "text-green-custom" : "text-red-custom"}`}>
              {s.pctChange != null ? `${s.pctChange >= 0 ? "▲" : "▼"} ${Math.abs(s.pctChange).toFixed(2)}%` : "—"}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
