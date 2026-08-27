"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api";

type OverallStats = {
  totalUsers: number;
  verifiedKyc: number;
  pendingKyc: number;
};

type DailyGrowth = {
  date: string;
  count: number;
};

type AnalyticsResponse = {
  overall: OverallStats;
  dailyGrowth: DailyGrowth[];
};

export default function AnalyticsConsolePage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<AnalyticsResponse>("/api/admin/analytics");
      setData(res);
    } catch (err: any) {
      setError(err.message || "Failed to load system analytical aggregates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return (
    <div className="p-6 sm:p-8 flex flex-col gap-6 animate-card-enter">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-border-custom pb-4">
        <div>
          <h1 className="font-display text-xl tracking-[0.1em] text-red-custom uppercase">
            System Growth Analytics
          </h1>
          <p className="font-mono text-[0.65rem] text-text-3 mt-1 uppercase">
            User registration trends, KYC conversion rates, and volume metrics
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
          COMPUTING STATISTICAL SERIES DATA...
        </div>
      ) : (
        data && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start font-mono text-xs">
            {/* KPI Cards */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              <div className="border border-border-custom bg-bg-1 p-5 rounded">
                <span className="text-[0.6rem] text-text-3 uppercase tracking-wider block mb-1">Total Users</span>
                <span className="text-2xl font-bold text-text-custom">{data.overall.totalUsers}</span>
              </div>
              <div className="border border-border-custom bg-bg-1 p-5 rounded">
                <span className="text-[0.6rem] text-text-3 uppercase tracking-wider block mb-1">Verified KYC Accounts</span>
                <span className="text-2xl font-bold text-green-custom">{data.overall.verifiedKyc}</span>
              </div>
              <div className="border border-border-custom bg-bg-1 p-5 rounded">
                <span className="text-[0.6rem] text-text-3 uppercase tracking-wider block mb-1">Pending KYC Reviews</span>
                <span className="text-2xl font-bold text-amber-custom">{data.overall.pendingKyc}</span>
              </div>
            </div>

            {/* Growth Table Chart */}
            <div className="lg:col-span-8 border border-border-custom bg-bg-1 p-5 rounded flex flex-col gap-3">
              <h3 className="text-xs font-bold text-text-custom uppercase border-b border-border-custom pb-2">// Daily Signups Growth Log</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[0.7rem] border-collapse">
                  <thead>
                    <tr className="border-b border-border-custom bg-bg-2/30 text-text-3 uppercase text-[0.6rem]">
                      <th className="p-2">Registration Date</th>
                      <th className="p-2 text-right">Accounts Created</th>
                      <th className="p-2 text-right">Trend Visualizer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dailyGrowth.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-4 text-center text-text-4">No registration history logged</td>
                      </tr>
                    ) : (
                      data.dailyGrowth.map((g, idx) => (
                        <tr key={idx} className="border-b border-border-custom/50">
                          <td className="p-2 font-bold text-text-custom">{g.date}</td>
                          <td className="p-2 text-right text-text-custom font-bold">{g.count} users</td>
                          <td className="p-2 text-right">
                            <div className="inline-flex gap-0.5 bg-red-dim/20 px-2 py-1 rounded text-red-custom font-bold text-[0.62rem] uppercase border border-red-custom/10">
                              {Array(g.count).fill("█").join("") || "•"}
                            </div>
                          </td>
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
