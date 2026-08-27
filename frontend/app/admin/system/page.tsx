"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api";

type ProviderConfig = {
  marketData: string;
  news: string;
  funds: string;
  ipo: { id: string; configured: boolean };
  payments: { id: string; configured: boolean };
  brokers: string[];
};

type HealthResponse = {
  database: string;
  providers: ProviderConfig;
  timestamp: string;
};

export default function SystemHealthPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<HealthResponse>("/api/admin/system/health");
      setHealth(res);
    } catch (err: any) {
      setError(err.message || "Failed to load system diagnostics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  return (
    <div className="p-6 sm:p-8 flex flex-col gap-6 animate-card-enter">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-border-custom pb-4">
        <div>
          <h1 className="font-display text-xl tracking-[0.1em] text-red-custom uppercase">
            Microservice Operational Diagnostic
          </h1>
          <p className="font-mono text-[0.65rem] text-text-3 mt-1 uppercase">
            Check network route delays, verify database transactions, and audit background job configs
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
          PINGING COMPONENT PORTS...
        </div>
      ) : (
        health && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 font-mono text-xs">
            {/* Database Health Card */}
            <div className="border border-border-custom bg-bg-1 p-5 rounded flex flex-col gap-4">
              <h3 className="text-xs font-bold text-text-custom uppercase border-b border-border-custom pb-2">// DB Connectivity Check</h3>
              <div className="flex justify-between items-center bg-bg-2/30 p-3 border border-border-custom rounded">
                <span>Postgres Neon Connection:</span>
                <span className={`px-2 py-0.5 rounded font-extrabold text-[0.62rem] ${
                  health.database === "HEALTHY" ? "bg-green-dim text-green-custom" : "bg-red-dim text-red-custom"
                }`}>
                  {health.database}
                </span>
              </div>
            </div>

            {/* Providers Specs Health Card */}
            <div className="border border-border-custom bg-bg-1 p-5 rounded flex flex-col gap-4">
              <h3 className="text-xs font-bold text-text-custom uppercase border-b border-border-custom pb-2">// API Connector Feeds</h3>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center bg-bg-2/30 p-2.5 border border-border-custom rounded">
                  <span className="text-text-3">Market Quote Feed:</span>
                  <span className="text-text-custom font-bold uppercase">{health.providers.marketData}</span>
                </div>
                <div className="flex justify-between items-center bg-bg-2/30 p-2.5 border border-border-custom rounded">
                  <span className="text-text-3">Finance News Provider:</span>
                  <span className="text-text-custom font-bold uppercase">{health.providers.news}</span>
                </div>
                <div className="flex justify-between items-center bg-bg-2/30 p-2.5 border border-border-custom rounded">
                  <span className="text-text-3">Mutual Funds Database:</span>
                  <span className="text-text-custom font-bold uppercase">{health.providers.funds}</span>
                </div>
                <div className="flex justify-between items-center bg-bg-2/30 p-2.5 border border-border-custom rounded">
                  <span className="text-text-3">Merchant Gateway:</span>
                  <span className="text-text-custom font-bold uppercase">
                    {health.providers.payments.id} ({health.providers.payments.configured ? "ONLINE" : "OFFLINE"})
                  </span>
                </div>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
