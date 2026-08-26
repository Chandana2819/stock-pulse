"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Brief = {
  generatedAt: string;
  marketRisk: { score: number; classification: string; reasons: string[] };
  drivers: string[];
  portfolio: { value: number; holdingsCount: number; estimatedChangeToday: number | null } | null;
  unreadNotifications: number;
  action: string;
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "GOOD MORNING";
  if (h < 17) return "GOOD AFTERNOON";
  return "GOOD EVENING";
}

const RISK_COLOR = (score: number) => (score >= 71 ? "text-red-custom" : score >= 51 ? "text-amber-custom" : score >= 31 ? "text-cyan-custom" : "text-green-custom");

export default function MarketBrief() {
  const [brief, setBrief] = useState<Brief | null>(null);

  useEffect(() => {
    api.get<Brief>("/api/market/brief").then(setBrief).catch(() => setBrief(null));
  }, []);

  if (!brief) return null;

  return (
    <section className="border border-border-bright bg-bg-1 overflow-hidden">
      <div className="py-[0.6rem] px-6 border-b border-border-custom bg-bg-2">
        <span className="font-mono text-[1rem] tracking-[0.18em] text-text-3 uppercase font-bold">{greeting()} — YOUR MARKET BRIEF</span>
      </div>
      <div className="p-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="font-mono text-[0.72rem] text-text-3 uppercase tracking-widest">Market Risk</div>
            <div className={`font-display text-2xl ${RISK_COLOR(brief.marketRisk.score)}`}>{brief.marketRisk.score}/100 — {brief.marketRisk.classification}</div>
          </div>
          {brief.portfolio && (
            <div>
              <div className="font-mono text-[0.72rem] text-text-3 uppercase tracking-widest">Your Portfolio</div>
              <div className="font-display text-2xl text-text-custom">
                ₹{brief.portfolio.value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                {brief.portfolio.estimatedChangeToday != null && (
                  <span className={`font-mono text-sm ml-2 ${brief.portfolio.estimatedChangeToday >= 0 ? "text-green-custom" : "text-red-custom"}`}>
                    {brief.portfolio.estimatedChangeToday >= 0 ? "+" : ""}₹{Math.round(brief.portfolio.estimatedChangeToday).toLocaleString("en-IN")}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {brief.drivers.length > 0 && (
          <div>
            <div className="font-mono text-[0.72rem] text-text-3 uppercase tracking-widest mb-1.5">Moving today</div>
            <div className="flex flex-wrap gap-2">
              {brief.drivers.map((d, i) => (
                <span key={i} className="font-mono text-[0.75rem] px-2.5 py-1 border border-border-custom bg-bg-2 text-text-2">{d}</span>
              ))}
            </div>
          </div>
        )}

        <div className="p-3 border border-cyan-custom/30 bg-blue-dim font-mono text-[0.82rem] text-text-custom">
          {brief.action}
        </div>
      </div>
    </section>
  );
}
