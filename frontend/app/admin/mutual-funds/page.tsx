"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api";

type MutualFundStats = {
  provider: string;
  watchlistsTracked: number;
  status: string;
};

export default function MutualFundsStatusPage() {
  const [stats, setStats] = useState<MutualFundStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<MutualFundStats>("/api/admin/mutual-funds");
      setStats(res);
    } catch (err: any) {
      setError(err.message || "Failed to load mutual funds statuses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <div className="p-6 sm:p-8 flex flex-col gap-6 animate-card-enter">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-border-custom pb-4">
        <div>
          <h1 className="font-display text-xl tracking-[0.1em] text-red-custom uppercase">
            Mutual Fund Feed Status
          </h1>
          <p className="font-mono text-[0.65rem] text-text-3 mt-1 uppercase">
            Monitor API integration settings, check watchlists, and verify data updates
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
          VERIFYING DATA FEEDS SPECIFICATIONS...
        </div>
      ) : (
        stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
            <div className="border border-border-custom bg-bg-1 p-5 rounded">
              <span className="text-[0.6rem] text-text-3 uppercase tracking-wider block mb-1">Fund Provider</span>
              <span className="text-xl font-bold text-text-custom uppercase">{stats.provider}</span>
            </div>
            <div className="border border-border-custom bg-bg-1 p-5 rounded">
              <span className="text-[0.6rem] text-text-3 uppercase tracking-wider block mb-1">Watchlists Active</span>
              <span className="text-xl font-bold text-text-custom">{stats.watchlistsTracked} items</span>
            </div>
            <div className="border border-border-custom bg-bg-1 p-5 rounded">
              <span className="text-[0.6rem] text-text-3 uppercase tracking-wider block mb-1">Feed Status</span>
              <span className={`text-xl font-bold uppercase ${stats.status === "ONLINE" ? "text-green-custom" : "text-red-custom"}`}>
                {stats.status}
              </span>
            </div>
          </div>
        )
      )}
    </div>
  );
}
