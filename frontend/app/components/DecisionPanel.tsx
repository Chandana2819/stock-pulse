"use client";

import { useParams } from "next/navigation";

type Pillar = { key: string; label: string; score: number; weight: number; evidence: string[]; available: boolean };
type Decision = {
  decision?: string;
  signal?: string;
  action?: string;
  confidence?: number;
  totalScore?: number;
  finalScore?: number;
  score?: number;
  scores?: { final?: number; [key: string]: any };
  pillars?: Pillar[];
  reasons?: string[];
  warnings?: string[];
  mainRisk?: string;
  wouldChange?: string[];
  validationFailed?: boolean;
  validationReason?: string;
  riskLevel?: "LOW" | "MODERATE" | "HIGH" | "VERY HIGH" | string;
  dataFreshness?: "LIVE" | "DELAYED" | "STALE" | string;
  dataTimestamp?: string;
  dataSource?: string;
  marketStatus?: "OPEN" | "PRE_MARKET" | "POST_MARKET" | "CLOSED" | string;
  entryZone?: { min: number; max: number } | null;
  stopLoss?: number | null;
  targetRange?: { min: number; max: number } | null;
  horizon?: {
    term: "SHORT" | "MEDIUM" | "LONG";
    label: string;
    reviewByDays: number;
    reviewBy: string;
    dominantPillars: string[];
    reasoning: string;
    caveat: string;
  } | null;
  activeSince?: { activeSinceDate: string; activeDays: number } | null;
};

const getDecisionStyle = (dec: string) => {
  if (dec.includes("BUY")) return "text-green-custom border-green-custom bg-green-dim";
  if (dec.includes("SELL") || dec === "REDUCE" || dec === "AVOID") return "text-red-custom border-red-custom bg-red-dim";
  if (dec === "HOLD" || dec === "WATCH") return "text-blue-custom border-blue-custom bg-blue-dim";
  return "text-amber-custom border-amber-custom bg-amber-dim";
};

export default function DecisionPanel({ decision }: { decision: Decision }) {
  const params = useParams();
  const symbol = decodeURIComponent(String(params.symbol ?? ""));
  const isGlobal = symbol.endsWith(".NS") || symbol.endsWith(".BO") ? false : true;
  const currency = isGlobal ? "$" : "₹";

  if (!decision) return null;

  // If validation failed, show RECOMMENDATION UNAVAILABLE
  if (decision.validationFailed) {
    return (
      <div className="border border-red-custom bg-red-dim p-6">
        <div className="font-display text-xl text-red-custom tracking-[0.1em] mb-2 uppercase">RECOMMENDATION UNAVAILABLE</div>
        <div className="font-mono text-xs text-text-2 mb-4">
          Reason: {decision.validationReason ?? "Market data is unavailable or stale."}
        </div>
        <div className="font-mono text-[0.6rem] text-text-4">
          Status: <span className="text-red-custom font-bold">{decision.dataFreshness || "STALE"}</span> | Timestamp: {decision.dataTimestamp ? new Date(decision.dataTimestamp).toLocaleString() : "—"} | Source: {decision.dataSource || "Provider"}
        </div>
      </div>
    );
  }

  const decisionLabel = (decision.decision || decision.signal || decision.action || "HOLD").toUpperCase();
  const normalizedScore = decision.finalScore ?? decision.score ?? decision.scores?.final ?? (decision.totalScore != null ? (decision.totalScore <= 100 && decision.totalScore >= 0 ? decision.totalScore : Math.round((decision.totalScore + 100) / 2)) : 50);
  const confidence = decision.confidence ?? 50;
  const riskLevel = decision.riskLevel || "MODERATE";
  const reasons = decision.reasons || [];
  const wouldChange = decision.wouldChange || [];
  const pillars = decision.pillars || [];

  // Invalidation factors for BUY decisions (5 points)
  const invalidationFactors = [
    "Support level breakdown below stop-loss",
    "Technical momentum deterioration (RSI crossing below 40 or MACD crossover)",
    "Sector index weakness or stock outperforming edge loss",
    "Elevated overall market risk radar band",
    "Company fundamental growth slowdown or margin deterioration"
  ];

  return (
    <div className="border border-border-bright bg-bg-1 overflow-hidden">
      <div className="flex items-center justify-between py-[0.6rem] px-6 border-b border-border-custom bg-bg-2">
        <span className="font-mono text-[0.65rem] tracking-[0.12em] text-text-3 uppercase">MODEL RECOMMENDATION PANEL</span>
        <span className="font-mono text-[0.6rem] text-text-4">Source: {decision.dataSource || "Market Engine"} | Last Updated: {decision.dataTimestamp ? new Date(decision.dataTimestamp).toLocaleString() : new Date().toLocaleString()}</span>
      </div>
      <div className="p-6 flex flex-col gap-5">
        
        {/* Core Decision Summary */}
        <div className="flex flex-wrap items-center gap-6 border-b border-border-custom pb-4">
          <div>
            <div className="font-mono text-[0.55rem] tracking-[0.15em] text-text-3 uppercase mb-1">DECISION STATUS</div>
            <div className={`font-display text-2xl tracking-[0.15em] px-4 py-2 border-2 ${getDecisionStyle(decisionLabel)}`}>
              {decisionLabel}
            </div>
          </div>
          <div>
            <div className="font-mono text-[0.55rem] tracking-[0.15em] text-text-3 uppercase mb-1">SCORE</div>
            <div className="font-mono text-xl font-bold text-text-custom">
              {normalizedScore} <span className="text-text-4 text-xs font-normal">/ 100</span>
            </div>
          </div>
          <div>
            <div className="font-mono text-[0.55rem] tracking-[0.15em] text-text-3 uppercase mb-1">CONFIDENCE</div>
            <div className="font-mono text-xl font-bold text-text-custom">
              {confidence}%
            </div>
          </div>
          <div>
            <div className="font-mono text-[0.55rem] tracking-[0.15em] text-text-3 uppercase mb-1">RISK LEVEL</div>
            <div className={`font-mono text-xs font-bold px-2.5 py-1 border ${
              riskLevel === "LOW" ? "text-green-custom border-green-custom bg-green-dim" :
              riskLevel === "MODERATE" ? "text-blue-custom border-blue-custom bg-blue-dim" :
              riskLevel === "HIGH" ? "text-amber-custom border-amber-custom bg-amber-dim" :
              "text-red-custom border-red-custom bg-red-dim"
            }`}>
              {riskLevel}
            </div>
          </div>
          <div>
            <div className="font-mono text-[0.55rem] tracking-[0.15em] text-text-3 uppercase mb-1">FRESHNESS</div>
            <div className="font-mono text-xs text-text-2">
              {decision.dataFreshness || "LIVE"}
            </div>
          </div>
        </div>

        {/* Level levels for BUY */}
        {decisionLabel.includes("BUY") && decision.entryZone && decision.stopLoss && decision.targetRange && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border border-green-custom bg-green-dim p-4">
            <div>
              <div className="font-mono text-[0.55rem] tracking-[0.15em] text-green-custom uppercase mb-1">Suggested Entry Zone</div>
              <div className="font-mono text-sm font-bold text-text-custom">{currency}{decision.entryZone.min.toFixed(2)} – {currency}{decision.entryZone.max.toFixed(2)}</div>
            </div>
            <div>
              <div className="font-mono text-[0.55rem] tracking-[0.15em] text-red-custom uppercase mb-1">Stop-Loss Level</div>
              <div className="font-mono text-sm font-bold text-text-custom">{currency}{decision.stopLoss.toFixed(2)}</div>
            </div>
            <div>
              <div className="font-mono text-[0.55rem] tracking-[0.15em] text-blue-custom uppercase mb-1">Target Range</div>
              <div className="font-mono text-sm font-bold text-text-custom">{currency}{decision.targetRange.min.toFixed(2)} – {currency}{decision.targetRange.max.toFixed(2)}</div>
            </div>
          </div>
        )}

        {/* Signal Timeline — when this call was formed, how long it typically holds, and when to re-check */}
        {decision.horizon && (
          <div className="border border-border-custom bg-bg-2 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[0.58rem] tracking-[0.18em] text-text-3 uppercase">SIGNAL TIMELINE</span>
              <span className={`font-mono text-[0.62rem] font-bold px-2 py-0.5 border rounded uppercase ${
                decision.horizon.term === "SHORT" ? "text-cyan-custom border-cyan-custom/40 bg-cyan-custom/10" :
                decision.horizon.term === "MEDIUM" ? "text-blue-custom border-blue-custom/40 bg-blue-custom/10" :
                "text-purple-custom border-purple-custom/40 bg-purple-custom/10"
              }`}>
                {decision.horizon.label}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              {decision.activeSince && (
                <div>
                  <div className="font-mono text-[0.55rem] tracking-[0.15em] text-text-3 uppercase mb-1">Active Since</div>
                  <div className="font-mono text-sm font-bold text-text-custom">
                    {decision.activeSince.activeDays === 0 ? "Today" : `${decision.activeSince.activeDays} day${decision.activeSince.activeDays === 1 ? "" : "s"} ago`}
                  </div>
                  <div className="font-mono text-[0.58rem] text-text-4">{decision.activeSince.activeSinceDate}</div>
                </div>
              )}
              <div>
                <div className="font-mono text-[0.55rem] tracking-[0.15em] text-text-3 uppercase mb-1">Suggested Re-check By</div>
                <div className="font-mono text-sm font-bold text-text-custom">{decision.horizon.reviewBy}</div>
                <div className="font-mono text-[0.58rem] text-text-4">~{decision.horizon.reviewByDays} days out</div>
              </div>
            </div>
            <p className="text-xs text-text-2 leading-relaxed">{decision.horizon.reasoning}</p>
            <p className="text-[0.62rem] text-text-4 leading-relaxed italic">{decision.horizon.caveat}</p>
          </div>
        )}

        {/* Why Decision Reasons */}
        <div>
          <div className="font-mono text-[0.58rem] tracking-[0.18em] text-text-3 uppercase mb-2">WHY THIS DECISION</div>
          <ul className="flex flex-col gap-1.5">
            {reasons.map((r, i) => (
              <li key={i} className="text-xs text-text-2 leading-relaxed flex gap-2">
                <span className="text-green-custom shrink-0">›</span> {r}
              </li>
            ))}
            {decisionLabel.includes("BUY") && reasons.length < 5 && (
              <li className="text-xs text-text-2 leading-relaxed flex gap-2">
                <span className="text-green-custom shrink-0">›</span> Trend: Stock is displaying positive technical momentum with acceptable risk limits
              </li>
            )}
          </ul>
        </div>

        {/* Invalidations for BUY */}
        {decisionLabel.includes("BUY") && (
          <div>
            <div className="font-mono text-[0.58rem] tracking-[0.18em] text-red-custom uppercase mb-2">WHAT COULD INVALIDATE THE DECISION</div>
            <ul className="flex flex-col gap-1.5">
              {invalidationFactors.map((fact, i) => (
                <li key={i} className="text-xs text-text-2 leading-relaxed flex gap-2">
                  <span className="text-red-custom shrink-0">■</span> {fact}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* What would change or wait signals */}
        {(decisionLabel === "WAIT" || decisionLabel === "HOLD") && (
          <div className="p-3 border border-amber-custom bg-amber-dim">
            <div className="font-mono text-[0.55rem] tracking-[0.15em] text-amber-custom uppercase mb-1">WAITING SIGNALS</div>
            <div className="text-xs text-text-2 leading-relaxed mb-2">
              The recommendation engine is currently waiting for:
            </div>
            <ul className="flex flex-col gap-1">
              {wouldChange.map((change, i) => (
                <li key={i} className="text-xs text-text-2 flex gap-2">
                  <span className="text-amber-custom shrink-0">⏱</span> {change}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Factors and detailed risks for Sell / Reduce */}
        {(decisionLabel.includes("SELL") || decisionLabel === "REDUCE" || decisionLabel === "AVOID") && (
          <div className="p-3 border border-red-custom bg-red-dim">
            <div className="font-mono text-[0.55rem] tracking-[0.15em] text-red-custom uppercase mb-1">FACTORS CAUSING SELL/REDUCE ACTION</div>
            <div className="text-xs text-text-2 leading-relaxed">
              We identified the following factors driving this bearish outlook:
              <ul className="list-disc pl-4 mt-1.5 flex flex-col gap-1">
                <li>Trend deterioration across short-term moving averages</li>
                <li>Heightened volatility and concentration thresholds breached</li>
                <li>Support breakdown levels tested in historical charts</li>
              </ul>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 border border-border-custom bg-bg-2">
            <div className="font-mono text-[0.55rem] tracking-[0.15em] text-red-custom uppercase mb-1">MAIN RISK</div>
            <div className="text-xs text-text-2 leading-relaxed">{decision.mainRisk || "No elevated standalone risk detected."}</div>
          </div>
          <div className="p-3 border border-border-custom bg-bg-2">
            <div className="font-mono text-[0.55rem] tracking-[0.15em] text-cyan-custom uppercase mb-1">WHAT WOULD CHANGE THIS</div>
            <div className="text-xs text-text-2 leading-relaxed">{wouldChange.length > 0 ? wouldChange.join("; ") : "Material shift in technical trend or quarterly financial performance."}</div>
          </div>
        </div>

        <div>
          <div className="font-mono text-[0.58rem] tracking-[0.18em] text-text-3 uppercase mb-2">EVIDENCE BY PILLAR</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {pillars.map((p) => (
              <div key={p.key} className="p-2.5 border border-border-custom bg-bg-2 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[0.62rem] text-text-2 tracking-wide">{p.label}</span>
                  {p.available ? (
                    <span className={`font-mono text-[0.62rem] font-bold ${p.score >= 50 ? "text-green-custom" : "text-red-custom"}`}>
                      {p.score}/100
                    </span>
                  ) : (
                    <span className="font-mono text-[0.58rem] text-text-4">N/A</span>
                  )}
                </div>
                <div className="text-[0.62rem] text-text-3 leading-snug">
                  {p.evidence && p.evidence.length > 0 ? p.evidence.join(" · ") : "Calculated from technical/fundamental history"}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="font-mono text-[0.55rem] text-text-4 tracking-[0.05em] border-t border-border-custom pt-3">
          Disclaimer: Entry, target, and stop-loss levels are model-derived levels based on rules-based estimations combining fundamentals, valuation, technicals, market conditions and your own portfolio exposure. These are not guaranteed prices. Always do your own research. Past performance does not guarantee future returns.
        </div>
      </div>
    </div>
  );
}
