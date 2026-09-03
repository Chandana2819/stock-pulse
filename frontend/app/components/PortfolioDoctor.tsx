"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Health = {
  score: number;
  strengths: string[];
  problems: string[];
  concentration: { symbol: string; pctOfPortfolio: number }[];
  sectorExposure: { sectorKey: string; sector: string; pctOfPortfolio: number }[];
  stressTests: { label: string; estimatedImpactPct: number }[];
  cashPct: number;
};

type Performance = { totalValue: number; unrealizedPl: number; unrealizedPlPct: number; realizedPl: number; cagrPct: number | null; xirrPct: number | null };

const scoreColor = (s: number) => (s >= 75 ? "text-green-custom" : s >= 50 ? "text-amber-custom" : "text-red-custom");

export default function PortfolioDoctor() {
  const [health, setHealth] = useState<Health | null>(null);
  const [perf, setPerf] = useState<Performance | null>(null);

  useEffect(() => {
    api.get<Health>("/api/portfolio/health").then(setHealth).catch(() => setHealth(null));
    api.get<Performance>("/api/portfolio/performance").then(setPerf).catch(() => setPerf(null));
  }, []);

  if (!health) return null;

  return (
    <section className="border border-border-bright bg-bg-1 overflow-hidden">
      <div className="py-[0.6rem] px-6 border-b border-border-custom bg-bg-2">
        <span className="font-mono text-[0.62rem] tracking-[0.18em] text-text-3 uppercase">PORTFOLIO DOCTOR</span>
      </div>
      <div className="p-6 flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <div className={`font-display text-4xl ${scoreColor(health.score)}`}>{health.score}</div>
          <div className="font-mono text-xs text-text-3">/ 100 HEALTH SCORE</div>
        </div>

        {perf && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2.5 border border-border-custom bg-bg-2 text-center">
              <div className="font-mono text-[0.55rem] text-text-3 uppercase">Unrealized P&L</div>
              <div className={`font-mono text-sm font-bold ${perf.unrealizedPl >= 0 ? "text-green-custom" : "text-red-custom"}`}>{perf.unrealizedPl >= 0 ? "+" : ""}₹{perf.unrealizedPl.toFixed(0)}</div>
            </div>
            <div className="p-2.5 border border-border-custom bg-bg-2 text-center">
              <div className="font-mono text-[0.55rem] text-text-3 uppercase">Realized P&L</div>
              <div className={`font-mono text-sm font-bold ${perf.realizedPl >= 0 ? "text-green-custom" : "text-red-custom"}`}>{perf.realizedPl >= 0 ? "+" : ""}₹{perf.realizedPl.toFixed(0)}</div>
            </div>
            <div className="p-2.5 border border-border-custom bg-bg-2 text-center">
              <div className="font-mono text-[0.55rem] text-text-3 uppercase">XIRR</div>
              <div className="font-mono text-sm font-bold text-text-custom">{perf.xirrPct != null ? `${perf.xirrPct.toFixed(1)}%` : "—"}</div>
            </div>
            <div className="p-2.5 border border-border-custom bg-bg-2 text-center">
              <div className="font-mono text-[0.55rem] text-text-3 uppercase">Cash %</div>
              <div className="font-mono text-sm font-bold text-text-custom">{health.cashPct}%</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="font-mono text-[0.55rem] tracking-[0.15em] text-green-custom uppercase mb-1.5">STRENGTHS</div>
            <ul className="flex flex-col gap-1">
              {health.strengths.map((s, i) => (
                <li key={i} className="text-xs text-text-2 flex gap-1.5"><span className="text-green-custom">✓</span>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-mono text-[0.55rem] tracking-[0.15em] text-amber-custom uppercase mb-1.5">PROBLEMS</div>
            <ul className="flex flex-col gap-1">
              {health.problems.length === 0 ? (
                <li className="text-xs text-text-3">None detected</li>
              ) : (
                health.problems.map((p, i) => (
                  <li key={i} className="text-xs text-text-2 flex gap-1.5"><span className="text-amber-custom">⚠</span>{p}</li>
                ))
              )}
            </ul>
          </div>
        </div>

        {health.stressTests.length > 0 && (
          <div>
            <div className="font-mono text-[0.55rem] tracking-[0.15em] text-text-3 uppercase mb-1.5">STRESS TEST</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {health.stressTests.map((s, i) => (
                <div key={i} className="p-2 border border-border-custom bg-bg-2">
                  <div className="text-[0.6rem] text-text-3">{s.label}</div>
                  <div className="font-mono text-sm font-bold text-red-custom">{s.estimatedImpactPct.toFixed(2)}%</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
