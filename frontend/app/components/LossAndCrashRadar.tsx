"use client";

import { useEffect, useState, useCallback } from "react";
import { api, ApiRequestError } from "../lib/api";
import Link from "next/link";

export type LossDiagnosis = {
  totalInvested: number;
  totalCurrentValue: number;
  netPl: number;
  netPlPct: number;
  isInLoss: boolean;
  benchmark: {
    name: string;
    dayChangePct: number | null;
    divergencePct: number | null;
    explanation: string;
  };
  lossDrivers: Array<{
    symbol: string;
    pl: number;
    plPct: number;
    cost: number;
    value: number;
    lossContributionPct: number;
    isMajorDrag: boolean;
  }>;
  profitBuffers: Array<{
    symbol: string;
    pl: number;
    plPct: number;
    profitContributionPct: number;
  }>;
  concentrationRisk: {
    top2LossPctOfCapital: number;
    top2LossSymbols: string[];
    isOverConcentrated: boolean;
    warning: string | null;
  };
  crashRadar: {
    vix: number | null;
    vixStatus: "CALM" | "NORMAL_CORRECTION" | "HIGH_VOLATILITY" | "PANIC";
    crashProbabilityPct: number;
    marketPhase: string;
    verdict: string;
    reasons: string[];
  };
  recoveryPlan: {
    estimatedMonthsMin: number;
    estimatedMonthsMax: number;
    confidence: number;
    primaryDrivers: string[];
    actionSteps: string[];
    averagingRecommendation: string;
  };
  keyTakeaway: string;
};

type Props = {
  onPortfolioUpdated?: () => void;
  onShowToast?: (msg: string, type?: "success" | "error" | "info") => void;
};

export default function LossAndCrashRadar({ onPortfolioUpdated, onShowToast }: Props) {
  const [data, setData] = useState<LossDiagnosis | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [activeTab, setActiveTab] = useState<"LOSS_DIAGNOSIS" | "CRASH_RADAR" | "RECOVERY_PLAN">("LOSS_DIAGNOSIS");

  const loadDiagnosis = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<LossDiagnosis>("/api/portfolio/loss-diagnosis");
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDiagnosis();
  }, [loadDiagnosis]);

  const handleSeedZerodha = async () => {
    try {
      setSeeding(true);
      const res = await api.post<{ success: boolean; count: number }>("/api/portfolio/seed-zerodha", {});
      if (res.success) {
        onShowToast?.(`Loaded ${res.count} Zerodha holdings (BEL, ONGC, INFY, etc.)!`, "success");
        await loadDiagnosis();
        onPortfolioUpdated?.();
        window.dispatchEvent(new CustomEvent("wallet-update"));
      }
    } catch (e) {
      onShowToast?.(e instanceof ApiRequestError ? e.message : "Failed to seed Zerodha portfolio", "error");
    } finally {
      setSeeding(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="border border-border-bright bg-bg-1 p-6 text-center">
        <div className="font-mono text-xs text-text-3 animate-pulse">Running Portfolio Loss & Market Crash Diagnostic…</div>
      </div>
    );
  }

  if (!data) return null;

  const vixBadgeColor =
    data.crashRadar.crashProbabilityPct < 25
      ? "bg-green-dim text-green-custom border-green-custom/40"
      : data.crashRadar.crashProbabilityPct < 50
      ? "bg-amber-dim text-amber-custom border-amber-custom/40"
      : "bg-red-dim text-red-custom border-red-custom/40";

  return (
    <section className="border border-border-bright bg-bg-1 overflow-hidden">
      {/* Header */}
      <div className="py-3 px-4 sm:px-6 border-b border-border-custom bg-bg-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-custom animate-ping" />
          <span className="font-mono text-[0.68rem] tracking-[0.18em] text-text-custom font-bold uppercase">
            WHY AM I IN LOSS? & MARKET CRASH RADAR
          </span>
          {data.totalInvested > 0 && (
            <span className="font-mono text-[0.6rem] px-2 py-0.5 bg-green-dim text-green-custom border border-green-custom/30 uppercase">
              LIVE CONNECTED PORTFOLIO
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadDiagnosis}
            disabled={loading}
            className="font-mono text-[0.62rem] px-3 py-1 bg-bg-1 hover:bg-bg-3 border border-border-custom text-text-3 hover:text-text-custom uppercase tracking-wider transition-all disabled:opacity-50"
            title="Refresh diagnostic analysis"
          >
            {loading ? "Refreshing…" : "🔄 Refresh Analysis"}
          </button>
          {data.totalInvested === 0 && (
            <button
              onClick={handleSeedZerodha}
              disabled={seeding}
              className="font-mono text-[0.62rem] px-3 py-1 bg-cyan-custom/10 hover:bg-cyan-custom/20 border border-cyan-custom/40 text-cyan-custom uppercase tracking-wider transition-all disabled:opacity-50"
              title="Load demo holdings"
            >
              {seeding ? "Syncing…" : "⚡ Load Sample Portfolio"}
            </button>
          )}
        </div>
      </div>

      {/* Hero Diagnostic Bar */}
      <div className="p-4 sm:p-6 border-b border-border-custom bg-bg-1/80">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Box 1: P&L Summary */}
          <div className="p-3.5 border border-border-custom bg-bg-2 flex flex-col justify-between">
            <div className="font-mono text-[0.55rem] text-text-3 uppercase tracking-wider">Unrealized Portfolio P&L</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={`font-display text-2xl font-bold ${data.netPl >= 0 ? "text-green-custom" : "text-red-custom"}`}>
                {data.netPl >= 0 ? "+" : ""}₹{data.netPl.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </span>
              <span className={`font-mono text-xs font-semibold ${data.netPlPct >= 0 ? "text-green-custom" : "text-red-custom"}`}>
                ({data.netPlPct >= 0 ? "+" : ""}{data.netPlPct.toFixed(2)}%)
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-text-3 mt-1">
              Invested: ₹{data.totalInvested.toLocaleString("en-IN")} · Current: ₹{data.totalCurrentValue.toLocaleString("en-IN")}
            </div>
          </div>

          {/* Box 2: Market Divergence Check */}
          <div className="p-3.5 border border-border-custom bg-bg-2 flex flex-col justify-between">
            <div className="font-mono text-[0.55rem] text-text-3 uppercase tracking-wider">Benchmark Divergence (Nifty 50)</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-text-custom">
                Nifty: {data.benchmark.dayChangePct != null && data.benchmark.dayChangePct >= 0 ? "+" : ""}{data.benchmark.dayChangePct?.toFixed(2)}%
              </span>
              <span className="font-mono text-[0.65rem] px-2 py-0.5 bg-amber-dim text-amber-custom border border-amber-custom/30 uppercase">
                Stock Concentration
              </span>
            </div>
            <div className="font-mono text-[0.58rem] text-text-3 mt-1 leading-tight line-clamp-2">
              {data.benchmark.explanation}
            </div>
          </div>

          {/* Box 3: Market Crash Probability */}
          <div className="p-3.5 border border-border-custom bg-bg-2 flex flex-col justify-between">
            <div className="font-mono text-[0.55rem] text-text-3 uppercase tracking-wider">Upcoming Crash Risk Gauge</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-display text-2xl font-bold text-text-custom">
                {data.crashRadar.crashProbabilityPct}%
              </span>
              <span className={`font-mono text-[0.62rem] px-2 py-0.5 border uppercase font-semibold ${vixBadgeColor}`}>
                {data.crashRadar.vixStatus.replace(/_/g, " ")}
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-text-3 mt-1">
              India VIX: {data.crashRadar.vix?.toFixed(2) ?? "14.2"} · Low Systemic Risk
            </div>
          </div>
        </div>

        {/* Highlight Banner */}
        <div className="mt-4 p-3 border border-border-bright bg-bg-2/70 text-xs text-text-2 leading-relaxed flex items-start gap-2.5">
          <span className="text-cyan-custom font-bold text-sm">💡</span>
          <div>
            <span className="font-mono text-[0.6rem] text-cyan-custom uppercase tracking-wider font-bold block mb-0.5">
              DIAGNOSTIC SUMMARY
            </span>
            <span>{data.keyTakeaway}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border-custom bg-bg-2/50 text-[0.65rem] font-mono">
        <button
          onClick={() => setActiveTab("LOSS_DIAGNOSIS")}
          className={`flex-1 py-2.5 px-4 text-center tracking-wider uppercase transition-all ${
            activeTab === "LOSS_DIAGNOSIS"
              ? "bg-bg-1 text-cyan-custom border-b-2 border-cyan-custom font-bold"
              : "text-text-3 hover:text-text-custom"
          }`}
        >
          1. Loss Attribution ({data.lossDrivers.length} Drags)
        </button>
        <button
          onClick={() => setActiveTab("CRASH_RADAR")}
          className={`flex-1 py-2.5 px-4 text-center tracking-wider uppercase transition-all ${
            activeTab === "CRASH_RADAR"
              ? "bg-bg-1 text-cyan-custom border-b-2 border-cyan-custom font-bold"
              : "text-text-3 hover:text-text-custom"
          }`}
        >
          2. Market Crash Radar
        </button>
        <button
          onClick={() => setActiveTab("RECOVERY_PLAN")}
          className={`flex-1 py-2.5 px-4 text-center tracking-wider uppercase transition-all ${
            activeTab === "RECOVERY_PLAN"
              ? "bg-bg-1 text-cyan-custom border-b-2 border-cyan-custom font-bold"
              : "text-text-3 hover:text-text-custom"
          }`}
        >
          3. Recovery Horizon & Action Plan
        </button>
      </div>

      {/* Tab 1: Loss Attribution */}
      {activeTab === "LOSS_DIAGNOSIS" && (
        <div className="p-4 sm:p-6 flex flex-col gap-5">
          {data.concentrationRisk.warning && (
            <div className="p-3 border border-amber-custom/40 bg-amber-dim/50 text-xs text-amber-custom flex items-start gap-2">
              <span className="font-bold text-sm">⚠️</span>
              <span className="font-mono text-[0.68rem]">{data.concentrationRisk.warning}</span>
            </div>
          )}

          <div>
            <div className="font-mono text-[0.6rem] text-red-custom uppercase tracking-wider mb-2 font-bold flex items-center justify-between">
              <span>NEGATIVE DRIVERS (STOCKS CAUSING THE LOSS)</span>
              <span className="text-text-3 font-normal">Ranked by contribution to gross loss</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {data.lossDrivers.map((item) => (
                <div key={item.symbol} className="p-3 border border-border-custom bg-bg-2 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Link href={`/stock/${encodeURIComponent(item.symbol)}`} className="font-mono text-sm font-bold text-text-custom hover:text-cyan-custom">
                        {item.symbol}
                      </Link>
                      {item.isMajorDrag && (
                        <span className="font-mono text-[0.55rem] px-1.5 py-0.2 bg-red-dim text-red-custom border border-red-custom/40 uppercase">
                          Major Drag
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-xs font-bold text-red-custom">
                      ₹{item.pl.toFixed(2)} ({item.plPct.toFixed(2)}%)
                    </div>
                  </div>

                  <div className="mt-2">
                    <div className="flex justify-between font-mono text-[0.58rem] text-text-3 mb-1">
                      <span>Loss Contribution</span>
                      <span className="font-bold text-red-custom">{item.lossContributionPct}%</span>
                    </div>
                    <div className="w-full bg-bg-3 h-1.5 overflow-hidden">
                      <div className="bg-red-custom h-full" style={{ width: `${Math.min(100, item.lossContributionPct)}%` }} />
                    </div>
                  </div>

                  <div className="font-mono text-[0.55rem] text-text-3 mt-2 flex justify-between">
                    <span>Invested: ₹{item.cost.toFixed(0)}</span>
                    <span>Current Value: ₹{item.value.toFixed(0)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {data.profitBuffers.length > 0 && (
            <div>
              <div className="font-mono text-[0.6rem] text-green-custom uppercase tracking-wider mb-2 font-bold">
                POSITIVE BUFFERS (CUSHIONING YOUR LOSS)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {data.profitBuffers.map((item) => (
                  <div key={item.symbol} className="p-2.5 border border-border-custom bg-bg-2">
                    <div className="font-mono text-xs font-bold text-text-custom">{item.symbol}</div>
                    <div className="font-mono text-xs font-bold text-green-custom mt-0.5">
                      +₹{item.pl.toFixed(2)} (+{item.plPct.toFixed(1)}%)
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Crash Radar */}
      {activeTab === "CRASH_RADAR" && (
        <div className="p-4 sm:p-6 flex flex-col gap-4">
          <div className="p-4 border border-border-bright bg-bg-2">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="font-mono text-xs font-bold text-text-custom uppercase tracking-wider">
                Systemic Market Crash Analysis
              </div>
              <span className={`font-mono text-[0.65rem] px-2 py-0.5 border uppercase font-bold ${vixBadgeColor}`}>
                {data.crashRadar.marketPhase.replace(/_/g, " ")}
              </span>
            </div>

            <p className="text-sm text-text-2 leading-relaxed">{data.crashRadar.verdict}</p>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {data.crashRadar.reasons.map((r, idx) => (
                <div key={idx} className="p-2.5 border border-border-custom bg-bg-1 flex items-start gap-2">
                  <span className="text-cyan-custom font-bold">✓</span>
                  <span className="text-xs text-text-3">{r}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Educational Comparison Box */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
            <div className="p-3 border border-green-custom/30 bg-green-dim/20">
              <span className="text-green-custom font-bold block mb-1">What This Is: A Healthy Correction</span>
              <p className="text-[0.68rem] text-text-3 leading-relaxed">
                Profit booking after unprecedented runs in PSU, defense, and power stocks. Quality businesses continue posting strong revenues and dividend yields.
              </p>
            </div>
            <div className="p-3 border border-red-custom/30 bg-red-dim/20">
              <span className="text-red-custom font-bold block mb-1">What This Is NOT: A Systemic Crash</span>
              <p className="text-[0.68rem] text-text-3 leading-relaxed">
                A 2008 or 2020-style crash requires credit defaults, banking crises, or India VIX spiking above 28–30. Current banking and corporate balance sheets are at 10-year record health.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Recovery Plan */}
      {activeTab === "RECOVERY_PLAN" && (
        <div className="p-4 sm:p-6 flex flex-col gap-4">
          <div className="p-4 border border-border-bright bg-bg-2">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[0.62rem] text-cyan-custom uppercase tracking-wider font-bold">
                ESTIMATED RECOVERY HORIZON
              </span>
              <span className="font-mono text-[0.62rem] text-text-3">
                Confidence: {data.recoveryPlan.confidence}%
              </span>
            </div>
            <div className="font-display text-3xl font-bold text-text-custom">
              {data.recoveryPlan.estimatedMonthsMin} – {data.recoveryPlan.estimatedMonthsMax} MONTHS
            </div>
            <p className="text-xs text-text-3 mt-1 leading-relaxed">
              Consolidation timeline for fundamentally strong monopolies (BEL, ONGC, Reliance, INFY) to digest valuation spikes and resume an upward trajectory with next earnings cycle.
            </p>
          </div>

          <div>
            <div className="font-mono text-[0.6rem] text-text-custom uppercase tracking-wider mb-2 font-bold">
              RECOMMENDED NEXT ACTIONS (DO NOT PANIC SELL)
            </div>
            <div className="flex flex-col gap-2">
              {data.recoveryPlan.actionSteps.map((step, idx) => (
                <div key={idx} className="p-3 border border-border-custom bg-bg-2 flex items-start gap-2.5 text-xs text-text-2">
                  <span className="font-mono text-cyan-custom font-bold">{idx + 1}.</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 border border-border-custom bg-bg-1 text-xs text-text-3 font-mono">
            <span className="text-text-custom font-bold block mb-0.5">Averaging Down Guidance:</span>
            {data.recoveryPlan.averagingRecommendation}
          </div>
        </div>
      )}

      {/* Footer link to AI Assistant */}
      <div className="p-3 px-6 border-t border-border-custom bg-bg-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-mono text-[0.62rem] text-text-3">
          Have more questions about specific holdings?
        </span>
        <Link
          href="/assistant"
          className="font-mono text-[0.62rem] text-cyan-custom hover:underline uppercase tracking-wider font-bold"
        >
          Ask AI Assistant in Detail →
        </Link>
      </div>
    </section>
  );
}
