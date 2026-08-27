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

type SystemHealth = {
  database: string;
  providers: ProviderConfig;
  timestamp: string;
};

export default function MarketStatusPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<SystemHealth>("/api/admin/system/health");
      setHealth(res);
    } catch (err: any) {
      setError(err.message || "Failed to load market operational status");
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
            Market Connectors & Feeds
          </h1>
          <p className="font-mono text-[0.65rem] text-text-3 mt-1 uppercase">
            Operational statuses of exchanges, licensed API providers, and data brokers
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
          FETCHING EXCHANGE ROUTE STATES...
        </div>
      ) : (
        health && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 font-mono text-xs">
            {/* Exchange statuses */}
            <div className="border border-border-custom bg-bg-1 p-5 rounded flex flex-col gap-4">
              <h3 className="text-xs font-bold text-text-custom uppercase border-b border-border-custom pb-2">// Exchange Feeds Status</h3>
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center bg-bg-2/30 p-2.5 border border-border-custom rounded">
                  <span>NSE (India):</span>
                  <span className="text-green-custom font-bold">ONLINE (YAHOO FEED)</span>
                </div>
                <div className="flex justify-between items-center bg-bg-2/30 p-2.5 border border-border-custom rounded">
                  <span>BSE (India):</span>
                  <span className="text-green-custom font-bold">ONLINE (YAHOO FEED)</span>
                </div>
                <div className="flex justify-between items-center bg-bg-2/30 p-2.5 border border-border-custom rounded">
                  <span>NASDAQ (US Global):</span>
                  <span className="text-green-custom font-bold">ONLINE (YAHOO FEED)</span>
                </div>
                <div className="flex justify-between items-center bg-bg-2/30 p-2.5 border border-border-custom rounded">
                  <span>NYSE (US Global):</span>
                  <span className="text-green-custom font-bold">ONLINE (YAHOO FEED)</span>
                </div>
              </div>
            </div>

            {/* Provider specs */}
            <div className="border border-border-custom bg-bg-1 p-5 rounded flex flex-col gap-4">
              <h3 className="text-xs font-bold text-text-custom uppercase border-b border-border-custom pb-2">// Provider Config Specs</h3>
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center bg-bg-2/30 p-2.5 border border-border-custom rounded">
                  <span>Market Provider:</span>
                  <span className="text-text-custom font-bold uppercase">{health.providers.marketData}</span>
                </div>
                <div className="flex justify-between items-center bg-bg-2/30 p-2.5 border border-border-custom rounded">
                  <span>News Aggregator:</span>
                  <span className="text-text-custom font-bold uppercase">{health.providers.news}</span>
                </div>
                <div className="flex justify-between items-center bg-bg-2/30 p-2.5 border border-border-custom rounded">
                  <span>Funds database:</span>
                  <span className="text-text-custom font-bold uppercase">{health.providers.funds}</span>
                </div>
                <div className="flex justify-between items-center bg-bg-2/30 p-2.5 border border-border-custom rounded">
                  <span>Merchant Connector:</span>
                  <span className="text-text-custom font-bold uppercase">{health.providers.payments.id}</span>
                </div>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
