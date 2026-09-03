"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api";

type SignalSummary = {
  BUY: number;
  SELL: number;
  HOLD: number;
};

type RecentSignal = {
  id: string;
  symbol: string;
  action: string;
  score: number;
  confidence: number;
  risk: string;
  generatedAt: string;
};

type SignalsResponse = {
  summary: SignalSummary;
  recentSignals: RecentSignal[];
};

export default function SignalsConsolePage() {
  const [data, setData] = useState<SignalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSignals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<SignalsResponse>("/api/admin/signals");
      setData(res);
    } catch (err: any) {
      setError(err.message || "Failed to load generated stock signals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  return (
    <div className="p-6 sm:p-8 flex flex-col gap-6 animate-card-enter">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-border-custom pb-4">
        <div>
          <h1 className="font-display text-xl tracking-[0.1em] text-red-custom uppercase">
            Signal Generation Tracker
          </h1>
          <p className="font-mono text-[0.65rem] text-text-3 mt-1 uppercase">
            Check generated recommendations, verify score evaluations, and review summaries
          </p>
        </div>
      </div>

      {error && (
        <div className="border border-red-custom/40 bg-red-dim/15 p-4 font-mono text-xs text-red-custom uppercase rounded">
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center font-mono text-xs text-text-3 animate-pulse">
          COLLECTING SCAN ENGINE HIGHLIGHTS...
        </div>
      ) : (
        data && (
          <div className="flex flex-col gap-6 font-mono text-xs">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="border border-border-custom bg-bg-1 p-5 rounded">
                <span className="text-[0.6rem] text-text-3 uppercase tracking-wider block mb-1">Buy Recoms</span>
                <span className="text-2xl font-bold text-green-custom">{data.summary.BUY}</span>
              </div>
              <div className="border border-border-custom bg-bg-1 p-5 rounded">
                <span className="text-[0.6rem] text-text-3 uppercase tracking-wider block mb-1">Sell Recoms</span>
                <span className="text-2xl font-bold text-red-custom">{data.summary.SELL}</span>
              </div>
              <div className="border border-border-custom bg-bg-1 p-5 rounded">
                <span className="text-[0.6rem] text-text-3 uppercase tracking-wider block mb-1">Hold Recoms</span>
                <span className="text-2xl font-bold text-text-custom">{data.summary.HOLD}</span>
              </div>
            </div>

            {/* Recent Signals List */}
            <div className="border border-border-custom bg-bg-1 p-5 rounded flex flex-col gap-3">
              <h3 className="text-xs font-bold text-text-custom uppercase border-b border-border-custom pb-2">Recent Generated Recommendations</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[0.7rem] border-collapse">
                  <thead>
                    <tr className="border-b border-border-custom bg-bg-2/30 text-text-3 uppercase text-[0.6rem]">
                      <th className="p-2">Asset Symbol</th>
                      <th className="p-2 text-center">Action Action</th>
                      <th className="p-2 text-right">Engine Score</th>
                      <th className="p-2 text-right">Confidence Match</th>
                      <th className="p-2 text-right">Risk Factor</th>
                      <th className="p-2 text-right">Scan Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentSignals.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-text-4">No recommendations generated recently</td>
                      </tr>
                    ) : (
                      data.recentSignals.map((s) => (
                        <tr key={s.id} className="border-b border-border-custom/50 hover:bg-bg-2/20">
                          <td className="p-2 font-bold text-text-custom">{s.symbol}</td>
                          <td className="p-2 text-center">
                            <span className={`px-1.5 py-0.2 rounded-sm text-[0.58rem] font-bold ${
                              s.action === "BUY" ? "bg-green-dim text-green-custom" :
                              s.action === "SELL" ? "bg-red-dim text-red-custom" : "bg-bg-3 text-text-3"
                            }`}>{s.action}</span>
                          </td>
                          <td className="p-2 text-right text-text-custom">{s.score} points</td>
                          <td className="p-2 text-right text-text-2">{(s.confidence * 100).toFixed(0)}%</td>
                          <td className="p-2 text-right uppercase text-text-3 font-semibold">{s.risk}</td>
                          <td className="p-2 text-right text-text-4">{new Date(s.generatedAt).toLocaleDateString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
