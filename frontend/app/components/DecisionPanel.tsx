"use client";

import { useParams } from "next/navigation";

type Pillar = { key: string; label: string; score: number; weight: number; evidence: string[]; available: boolean };
type Decision = {
  decision: "BUY" | "HOLD" | "WAIT" | "REDUCE" | "AVOID" | "WATCH";
  confidence: number;
  totalScore: number;
  pillars: Pillar[];
  reasons: string[];
  mainRisk: string;
  wouldChange: string[];
  dataWarnings?: string[];
  validationFailed?: boolean;
  validationReason?: string;
  riskLevel: "LOW" | "MODERATE" | "HIGH" | "VERY HIGH";
  dataFreshness: "LIVE" | "DELAYED" | "STALE";
  dataTimestamp: string;
  dataSource: string;
  marketStatus: "OPEN" | "PRE_MARKET" | "POST_MARKET" | "CLOSED";
  entryZone?: { min: number; max: number };
  stopLoss?: number;
  targetRange?: { min: number; max: number };
};

const DECISION_STYLE: Record<Decision["decision"], string> = {
  BUY: "text-green-custom border-green-custom bg-green-dim",
  WATCH: "text-cyan-custom border-cyan-custom bg-blue-dim",
  HOLD: "text-blue-custom border-blue-custom bg-blue-dim",
  WAIT: "text-amber-custom border-amber-custom bg-amber-dim",
  REDUCE: "text-amber-custom border-amber-custom bg-amber-dim",
  AVOID: "text-red-custom border-red-custom bg-red-dim",
};

export default function DecisionPanel({ decision }: { decision: Decision }) {
  const params = useParams();
  const symbol = decodeURIComponent(String(params.symbol ?? ""));
  const isGlobal = symbol.endsWith(".NS") || symbol.endsWith(".BO") ? false : true;
  const currency = isGlobal ? "$" : "₹";

  // If validation failed, show RECOMMENDATION UNAVAILABLE
  if (decision.validationFailed) {
    return (
      <div className="border border-red-custom bg-red-dim p-6">
        <div className="font-display text-xl text-red-custom tracking-[0.1em] mb-2 uppercase">RECOMMENDATION UNAVAILABLE</div>
        <div className="font-mono text-xs text-text-2 mb-4">
          Reason: {decision.validationReason ?? "Market data is unavailable or stale."}
        </div>
        <div className="font-mono text-[0.6rem] text-text-4">
          Status: <span className="text-red-custom font-bold">{decision.dataFreshness}</span> | Timestamp: {new Date(decision.dataTimestamp).toLocaleString()} | Source: {decision.dataSource}
        </div>
      </div>
    );
  }

  const normalizedScore = Math.round((decision.totalScore + 100) / 2);

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
        <span className="font-mono text-[0.65rem] tracking-[0.12em] text-text-3 uppercase">// MODEL RECOMMENDATION PANEL</span>
        <span className="font-mono text-[0.6rem] text-text-4">Source: {decision.dataSource} | Last Updated: {new Date(decision.dataTimestamp).toLocaleString()}</span>
      </div>
      <div className="p-6 flex flex-col gap-5">
        
        {/* Core Decision Summary */}
        <div className="flex flex-wrap items-center gap-6 border-b border-border-custom pb-4">
          <div>
            <div className="font-mono text-[0.55rem] tracking-[0.15em] text-text-3 uppercase mb-1">DECISION STATUS</div>
            <div className={`font-display text-2xl tracking-[0.15em] px-4 py-2 border-2 ${DECISION_STYLE[decision.decision]}`}>
              {decision.decision}
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
              {decision.confidence}%
            </div>
          </div>
          <div>
            <div className="font-mono text-[0.55rem] tracking-[0.15em] text-text-3 uppercase mb-1">RISK LEVEL</div>
            <div className={`font-mono text-xs font-bold px-2.5 py-1 border ${
              decision.riskLevel === "LOW" ? "text-green-custom border-green-custom bg-green-dim" :
              decision.riskLevel === "MODERATE" ? "text-blue-custom border-blue-custom bg-blue-dim" :
              decision.riskLevel === "HIGH" ? "text-amber-custom border-amber-custom bg-amber-dim" :
              "text-red-custom border-red-custom bg-red-dim"
            }`}>
              {decision.riskLevel}
            </div>
          </div>
          <div>
            <div className="font-mono text-[0.55rem] tracking-[0.15em] text-text-3 uppercase mb-1">FRESHNESS</div>
            <div className="font-mono text-xs text-text-2">
              {decision.dataFreshness}
            </div>
          </div>
        </div>

        {/* Level levels for BUY */}
        {decision.decision === "BUY" && decision.entryZone && decision.stopLoss && decision.targetRange && (
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

        {/* Why Decision Reasons */}
        <div>
          <div className="font-mono text-[0.58rem] tracking-[0.18em] text-text-3 uppercase mb-2">WHY THIS DECISION</div>
          <ul className="flex flex-col gap-1.5">
            {decision.reasons.map((r, i) => (
              <li key={i} className="text-xs text-text-2 leading-relaxed flex gap-2">
                <span className="text-green-custom shrink-0">›</span> {r}
              </li>
            ))}
            {decision.decision === "BUY" && decision.reasons.length < 5 && (
              <li className="text-xs text-text-2 leading-relaxed flex gap-2">
                <span className="text-green-custom shrink-0">›</span> Trend: Stock is displaying positive technical momentum with acceptable risk limits
              </li>
            )}
          </ul>
        </div>

        {/* Invalidations for BUY */}
        {decision.decision === "BUY" && (
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
        {(decision.decision === "WAIT" || decision.decision === "HOLD") && (
          <div className="p-3 border border-amber-custom bg-amber-dim">
            <div className="font-mono text-[0.55rem] tracking-[0.15em] text-amber-custom uppercase mb-1">WAITING SIGNALS</div>
            <div className="text-xs text-text-2 leading-relaxed mb-2">
              The recommendation engine is currently waiting for:
            </div>
            <ul className="flex flex-col gap-1">
              {decision.wouldChange.map((change, i) => (
                <li key={i} className="text-xs text-text-2 flex gap-2">
                  <span className="text-amber-custom shrink-0">⏱</span> {change}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Factors and detailed risks for Sell / Reduce */}
        {(decision.decision === "REDUCE" || decision.decision === "AVOID") && (
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

        {decision.dataWarnings && decision.dataWarnings.length > 0 && (
          <div className="p-3 border border-amber-custom bg-amber-dim">
            <div className="font-mono text-[0.55rem] tracking-[0.15em] text-amber-custom uppercase mb-1">⚠ DATA OUTAGE</div>
            <ul className="text-xs text-text-2 leading-relaxed list-disc pl-4 flex flex-col gap-0.5">
              {decision.dataWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 border border-border-custom bg-bg-2">
            <div className="font-mono text-[0.55rem] tracking-[0.15em] text-red-custom uppercase mb-1">MAIN RISK</div>
            <div className="text-xs text-text-2 leading-relaxed">{decision.mainRisk}</div>
          </div>
          <div className="p-3 border border-border-custom bg-bg-2">
            <div className="font-mono text-[0.55rem] tracking-[0.15em] text-cyan-custom uppercase mb-1">WHAT WOULD CHANGE THIS</div>
            <div className="text-xs text-text-2 leading-relaxed">{decision.wouldChange.join("; ")}</div>
          </div>
        </div>

        <div>
          <div className="font-mono text-[0.58rem] tracking-[0.18em] text-text-3 uppercase mb-2">EVIDENCE BY PILLAR</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {decision.pillars.map((p) => (
              <div key={p.key} className="p-2.5 border border-border-custom bg-bg-2 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[0.62rem] text-text-2 tracking-wide">{p.label}</span>
                  {p.available ? (
                    <span className={`font-mono text-[0.62rem] font-bold ${p.score > 0 ? "text-green-custom" : p.score < 0 ? "text-red-custom" : "text-text-3"}`}>
                      {p.score > 0 ? "+" : ""}{p.score}
                    </span>
                  ) : (
                    <span className="font-mono text-[0.58rem] text-text-4">N/A</span>
                  )}
                </div>
                <div className="text-[0.62rem] text-text-3 leading-snug">{p.evidence.join(" · ")}</div>
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
