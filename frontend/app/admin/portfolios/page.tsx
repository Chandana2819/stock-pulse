"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "../../lib/api";

type PortfolioOverview = {
  userId: string;
  username: string;
  walletInr: number;
  walletUsd: number;
  holdingsCount: number;
  totalInvested: number;
};

export default function PortfoliosTrackerPage() {
  const [portfolios, setPortfolios] = useState<PortfolioOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPortfolios = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<PortfolioOverview[]>("/api/admin/portfolios");
      setPortfolios(res);
    } catch (err: any) {
      setError(err.message || "Failed to load portfolios logs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPortfolios();
  }, [fetchPortfolios]);

  return (
    <div className="p-6 sm:p-8 flex flex-col gap-6 animate-card-enter">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-border-custom pb-4">
        <div>
          <h1 className="font-display text-xl tracking-[0.1em] text-red-custom uppercase">
            User Portfolio Monitor
          </h1>
          <p className="font-mono text-[0.65rem] text-text-3 mt-1 uppercase">
            Track user invested values, check hold quantities, and inspect balances
          </p>
        </div>
      </div>

      {error && (
        <div className="border border-red-custom/40 bg-red-dim/15 p-4 font-mono text-xs text-red-custom uppercase rounded">
          ⚠️ {error}
        </div>
      )}

      {/* Portfolios Table */}
      <div className="border border-border-custom bg-bg-1 rounded overflow-hidden">
        {loading ? (
          <div className="p-8 text-center font-mono text-xs text-text-3 animate-pulse">
            LOADING PORTFOLIOS DATA...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b border-border-custom bg-bg-2 text-text-2 uppercase text-[0.62rem] tracking-wider">
                  <th className="p-3">User</th>
                  <th className="p-3 text-right">Holdings Count</th>
                  <th className="p-3 text-right">Total Invested (Est)</th>
                  <th className="p-3 text-right">INR Cash</th>
                  <th className="p-3 text-right">USD Cash</th>
                  <th className="p-3 text-right">Review File</th>
                </tr>
              </thead>
              <tbody>
                {portfolios.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-text-4">
                      No active portfolios found in database
                    </td>
                  </tr>
                ) : (
                  portfolios.map((p) => (
                    <tr key={p.userId} className="border-b border-border-custom/50 hover:bg-bg-2/30">
                      <td className="p-3 font-bold text-text-custom">
                        <Link href={`/admin/users/${p.userId}`} className="text-text-custom hover:text-red-custom no-underline">
                          @{p.username}
                        </Link>
                      </td>
                      <td className="p-3 text-right text-text-custom font-semibold">{p.holdingsCount} assets</td>
                      <td className="p-3 text-right text-text-custom">₹{p.totalInvested.toLocaleString()}</td>
                      <td className="p-3 text-right text-text-2">₹{p.walletInr.toLocaleString()}</td>
                      <td className="p-3 text-right text-text-2">${p.walletUsd.toLocaleString()}</td>
                      <td className="p-3 text-right">
                        <Link
                          href={`/admin/users/${p.userId}`}
                          className="px-3 py-1 border border-red-custom hover:bg-red-custom hover:text-bg text-red-custom rounded font-bold text-[0.62rem] uppercase no-underline transition-all duration-150 inline-block"
                        >
                          View Holdings
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
