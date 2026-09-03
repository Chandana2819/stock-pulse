"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { getPositionGuidance } from "../lib/positionGuidance";

export type SignalPillar = {
  key: string;
  label: string;
  score: number;
  weight: number;
  evidence: string[];
  available: boolean;
};

export type SignalHorizon = {
  term: "SHORT" | "MEDIUM" | "LONG";
  label: string;
  reviewByDays: number;
  reviewBy: string;
  dominantPillars: string[];
  reasoning: string;
  caveat: string;
};

export type SignalDetailData = {
  symbol?: string;
  displaySymbol?: string;
  providerSymbol?: string;
  action?: string;
  signal?: string;
  finalScore?: number;
  score?: number;
  confidence?: number;
  riskLevel?: "LOW" | "MODERATE" | "HIGH" | "VERY HIGH" | string;
  risk?: string;
  stopLoss?: number | null;
  targetRange?: { min: number; max: number } | null;
  entryZone?: { min: number; max: number } | null;
  pillars?: SignalPillar[];
  reasons?: string[];
  warnings?: string[];
  mainRisk?: string;
  dataQuality?: string | number;
  dataTimestamp?: string;
  horizon?: SignalHorizon | null;
  activeSince?: { activeSinceDate: string; activeDays: number } | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  holding: {
    stock: string;
    displaySym: string;
    exchange: string;
    avgPrice: number;
    currentPrice: number;
    quantity: number;
    value: number;
    currency: "INR" | "USD";
    pl: number;
    plPct: number;
  } | null;
  signal: SignalDetailData | null;
  portfolioWeightPct?: number;
};

export default function SignalDetailModal({ isOpen, onClose, holding, signal, portfolioWeightPct }: Props) {
  const router = useRouter();

  if (!isOpen || !holding) return null;

  const action = (signal?.action || signal?.signal || "HOLD").toUpperCase();
  const score = signal?.finalScore ?? signal?.score ?? 50;
  const confidence = signal?.confidence ?? 50;
  const riskLevel = signal?.riskLevel || signal?.risk || "MODERATE";
  const currencySymbol = holding.currency === "USD" ? "$" : "₹";
  const positionGuidance = getPositionGuidance(action, score, portfolioWeightPct);

  const getPillarColor = (score: number) => {
    if (score >= 70) return "bg-green-custom";
    if (score >= 50) return "bg-blue-custom";
    if (score >= 40) return "bg-amber-custom";
    return "bg-red-custom";
  };

  const getPillarTextColor = (score: number) => {
    if (score >= 70) return "text-green-custom";
    if (score >= 50) return "text-blue-custom";
    if (score >= 40) return "text-amber-custom";
    return "text-red-custom";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-bg-1 border border-border-bright w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-border-custom bg-bg-2 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-xl font-bold tracking-wider text-text-custom">
                  {holding.displaySym}
                </span>
                <span className="font-mono text-[0.65rem] text-text-3 px-1.5 py-0.5 border border-border-custom rounded bg-bg-1">
                  {holding.exchange}
                </span>
                {portfolioWeightPct != null && (
                  <span className={`font-mono text-[0.65rem] px-2 py-0.5 border rounded ${
                    portfolioWeightPct > 25 
                      ? "bg-amber-custom/15 border-amber-custom/40 text-amber-custom font-bold" 
                      : "bg-bg-1 border-border-custom text-text-2"
                  }`}>
                    {portfolioWeightPct.toFixed(1)}% of Portfolio {portfolioWeightPct > 25 && "⚠️ Concentrated"}
                  </span>
                )}
              </div>
              <div className="font-mono text-xs text-text-3 mt-0.5">
                Current: <span className="text-cyan-custom font-bold">{currencySymbol}{holding.currentPrice?.toFixed(2)}</span>
                {" · "}Avg: <span className="text-text-custom">{currencySymbol}{holding.avgPrice?.toFixed(2)}</span>
                {" · "}P&L: <span className={holding.pl >= 0 ? "text-green-custom font-bold" : "text-red-custom font-bold"}>
                  {holding.pl >= 0 ? "+" : ""}{holding.pl?.toFixed(2)} ({holding.plPct >= 0 ? "+" : ""}{holding.plPct?.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-3 hover:text-text-custom font-mono text-lg px-2 py-1 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 flex flex-col gap-6">
          
          {/* Top Banner: Decision & Key Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border border-border-custom bg-bg-2 p-3 rounded">
              <div className="font-mono text-[0.6rem] text-text-3 uppercase tracking-wider mb-1">AI Recommendation</div>
              <div className={`font-display text-lg font-bold px-2 py-0.5 border rounded text-center uppercase inline-block ${
                action.includes("BUY") ? "bg-green-dim/20 border-green-custom text-green-custom" :
                (action.includes("SELL") || action === "REDUCE") ? "bg-red-dim/20 border-red-custom text-red-custom" :
                action === "HOLD" ? "bg-blue-custom/15 border-blue-custom text-blue-custom" :
                "bg-amber-custom/15 border-amber-custom text-amber-custom"
              }`}>
                <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
                  action.includes("BUY") ? "bg-green-custom" :
                  (action.includes("SELL") || action === "REDUCE") ? "bg-red-custom" :
                  action === "HOLD" ? "bg-blue-custom" : "bg-amber-custom"
                }`} />
                {action}
              </div>
            </div>

            <div className="border border-border-custom bg-bg-2 p-3 rounded">
              <div className="font-mono text-[0.6rem] text-text-3 uppercase tracking-wider mb-1">Composite Score</div>
              <div className="font-mono text-xl font-bold text-text-custom">
                {score} <span className="text-text-4 text-xs font-normal">/ 100</span>
              </div>
            </div>

            <div className="border border-border-custom bg-bg-2 p-3 rounded">
              <div className="font-mono text-[0.6rem] text-text-3 uppercase tracking-wider mb-1">Confidence</div>
              <div className="font-mono text-xl font-bold text-cyan-custom">
                {confidence}%
              </div>
            </div>

            <div className="border border-border-custom bg-bg-2 p-3 rounded">
              <div className="font-mono text-[0.6rem] text-text-3 uppercase tracking-wider mb-1">Risk Profile</div>
              <div className={`font-mono text-sm font-bold uppercase mt-1 ${
                riskLevel === "LOW" ? "text-green-custom" :
                riskLevel === "MODERATE" ? "text-blue-custom" :
                riskLevel === "HIGH" ? "text-amber-custom" : "text-red-custom"
              }`}>
                <svg className="w-3.5 h-3.5 inline-block -mt-0.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                {riskLevel}
              </div>
            </div>
          </div>

          {/* Position Sizing Guidance — shown for REDUCE / SELL / STRONG SELL only */}
          {positionGuidance && (
            <div className="border border-red-custom/30 bg-red-dim/10 p-4 rounded flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-[0.62rem] tracking-wider text-red-custom uppercase font-bold">
                  ⚠️ {positionGuidance.label}
                </span>
                <span className="font-mono text-[0.68rem] text-text-2 max-w-md leading-relaxed">
                  {positionGuidance.note}
                </span>
                {holding.quantity > 0 && (
                  <span className="font-mono text-[0.65rem] text-text-3 mt-0.5">
                    On your current holding of {holding.quantity} shares, that's ~{Math.round((holding.quantity * positionGuidance.pct) / 100)} shares.
                  </span>
                )}
              </div>
              <div className="font-mono text-3xl font-extrabold text-red-custom shrink-0">
                {positionGuidance.pct}%
              </div>
            </div>
          )}

          {/* Signal Timeline — when this call was formed, how long it typically holds, and when to re-check */}
          {signal?.horizon && (
            <div className="border border-border-custom bg-bg-2 p-4 rounded flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[0.65rem] tracking-[0.12em] text-text-2 uppercase font-bold">Signal Timeline</span>
                <span className={`font-mono text-[0.65rem] font-bold px-2 py-0.5 rounded border uppercase ${
                  signal.horizon.term === "SHORT" ? "text-cyan-custom border-cyan-custom/40 bg-cyan-custom/10" :
                  signal.horizon.term === "MEDIUM" ? "text-blue-custom border-blue-custom/40 bg-blue-custom/10" :
                  "text-purple-custom border-purple-custom/40 bg-purple-custom/10"
                }`}>
                  {signal.horizon.label}
                </span>
              </div>

              <div className="flex items-center gap-4">
                {signal.activeSince && (
                  <div className="flex-1">
                    <div className="font-mono text-[0.58rem] text-text-3 uppercase tracking-wider">Active Since</div>
                    <div className="font-mono text-sm font-bold text-text-custom">
                      {signal.activeSince.activeDays === 0 ? "Today" : `${signal.activeSince.activeDays} day${signal.activeSince.activeDays === 1 ? "" : "s"} ago`}
                    </div>
                    <div className="font-mono text-[0.6rem] text-text-4">{signal.activeSince.activeSinceDate}</div>
                  </div>
                )}
                <div className="flex-1">
                  <div className="font-mono text-[0.58rem] text-text-3 uppercase tracking-wider">Suggested Re-check By</div>
                  <div className="font-mono text-sm font-bold text-text-custom">{signal.horizon.reviewBy}</div>
                  <div className="font-mono text-[0.6rem] text-text-4">~{signal.horizon.reviewByDays} days out</div>
                </div>
              </div>

              <p className="font-mono text-[0.65rem] text-text-2 leading-relaxed">{signal.horizon.reasoning}</p>
              <p className="font-mono text-[0.58rem] text-text-4 leading-relaxed italic">{signal.horizon.caveat}</p>
            </div>
          )}

          {/* Target Price & Stop Loss Section */}
          <div className="border border-border-custom bg-bg-2/50 p-4 rounded flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex-1 text-center sm:text-left">
              <div className="font-mono text-[0.62rem] tracking-wider text-text-3 uppercase">TRAILING STOP-LOSS</div>
              <div className="font-mono text-base font-bold text-red-custom mt-0.5">
                {signal?.stopLoss ? `${currencySymbol}${signal.stopLoss.toFixed(2)}` : "—"}
              </div>
              <div className="font-mono text-[0.65rem] text-text-4">
                {signal?.stopLoss && holding.currentPrice 
                  ? `${(((signal.stopLoss - holding.currentPrice) / holding.currentPrice) * 100).toFixed(1)}% buffer from CMP`
                  : "Dynamic risk boundary"}
              </div>
            </div>

            <div className="h-8 w-px bg-border-custom hidden sm:block" />

            <div className="flex-1 text-center">
              <div className="font-mono text-[0.62rem] tracking-wider text-text-3 uppercase">ENTRY ACCUMULATION ZONE</div>
              <div className="font-mono text-base font-bold text-cyan-custom mt-0.5">
                {signal?.entryZone ? `${currencySymbol}${signal.entryZone.min} - ${currencySymbol}${signal.entryZone.max}` : "—"}
              </div>
              <div className="font-mono text-[0.65rem] text-text-4">Optimal reload range</div>
            </div>

            <div className="h-8 w-px bg-border-custom hidden sm:block" />

            <div className="flex-1 text-center sm:text-right">
              <div className="font-mono text-[0.62rem] tracking-wider text-text-3 uppercase">AI TARGET RANGE</div>
              <div className="font-mono text-base font-bold text-green-custom mt-0.5">
                {signal?.targetRange ? `${currencySymbol}${signal.targetRange.min} - ${currencySymbol}${signal.targetRange.max}` : "—"}
              </div>
              <div className="font-mono text-[0.65rem] text-text-4">
                {signal?.targetRange && holding.currentPrice 
                  ? `+${(((signal.targetRange.min - holding.currentPrice) / holding.currentPrice) * 100).toFixed(1)}% to +${(((signal.targetRange.max - holding.currentPrice) / holding.currentPrice) * 100).toFixed(1)}% target upside`
                  : "Upside projection"}
              </div>
            </div>
          </div>

          {/* 7 Pillars Breakdown */}
          <div>
            <div className="font-mono text-[0.68rem] tracking-[0.12em] text-text-2 uppercase mb-3 flex items-center justify-between">
              <span>7-PILLAR QUANTITATIVE ANALYSIS</span>
              <span className="text-[0.6rem] text-text-4">WEIGHTED BREAKDOWN</span>
            </div>

            {signal?.pillars && signal.pillars.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {signal.pillars.map((pillar) => (
                  <div key={pillar.key} className="border border-border-custom bg-bg-2 p-3 rounded flex flex-col gap-1.5">
                    <div className="flex items-center justify-between font-mono text-xs">
                      <span className="font-bold text-text-custom">{pillar.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[0.65rem] text-text-4">Weight: {(pillar.weight * 100).toFixed(0)}%</span>
                        <span className={`font-bold ${getPillarTextColor(pillar.score)}`}>
                          {pillar.score}/100
                        </span>
                      </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-bg-3 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${getPillarColor(pillar.score)} transition-all duration-300`}
                        style={{ width: `${Math.max(5, pillar.score)}%` }}
                      />
                    </div>
                    {pillar.evidence && pillar.evidence.length > 0 && (
                      <div className="font-mono text-[0.68rem] text-text-3 mt-0.5">
                        • {pillar.evidence[0]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-border-custom bg-bg-2 p-4 rounded text-center font-mono text-xs text-text-3">
                Live indicators and pillar components are calculating for this position.
              </div>
            )}
          </div>

          {/* Key Drivers & Warnings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Primary Catalysts */}
            <div className="border border-border-custom bg-bg-2 p-4 rounded flex flex-col gap-2">
              <div className="font-mono text-[0.65rem] tracking-wider text-green-custom uppercase font-bold">
                ✓ KEY POSITIVE DRIVERS
              </div>
              {signal?.reasons && signal.reasons.length > 0 ? (
                <ul className="flex flex-col gap-1.5 font-mono text-xs text-text-2">
                  {signal.reasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-green-custom mt-0.5">▸</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="font-mono text-xs text-text-4">No dominant catalysts detected.</div>
              )}
            </div>

            {/* Primary Risks & Warnings */}
            <div className="border border-border-custom bg-bg-2 p-4 rounded flex flex-col gap-2">
              <div className="font-mono text-[0.65rem] tracking-wider text-amber-custom uppercase font-bold">
                ⚠️ RISKS & CAUTIONARY SIGNALS
              </div>
              {signal?.warnings && signal.warnings.length > 0 ? (
                <ul className="flex flex-col gap-1.5 font-mono text-xs text-text-2">
                  {signal.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-amber-custom mt-0.5">▸</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="font-mono text-xs text-text-4">
                  {signal?.mainRisk ? `Main Risk: ${signal.mainRisk}` : "No acute risks triggered."}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between p-5 border-t border-border-custom bg-bg-2 mt-auto">
          <div className="font-mono text-[0.65rem] text-text-4">
            Data Freshness: <span className="text-text-custom font-bold">LIVE MODEL</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                onClose();
                router.push(`/stock/${encodeURIComponent(holding.displaySym)}`);
              }}
              className="font-mono text-xs bg-cyan-custom text-black font-bold py-2 px-4 rounded hover:bg-cyan-custom/90 transition-colors"
            >
              VIEW FULL CHART & ANALYTICS →
            </button>
            <button
              onClick={onClose}
              className="font-mono text-xs bg-transparent border border-border-custom text-text-2 py-2 px-4 rounded hover:bg-bg-3 hover:text-text-custom transition-colors"
            >
              CLOSE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
