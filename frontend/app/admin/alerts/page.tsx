"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api";

type AlertActivity = {
  id: string;
  username: string;
  symbol: string;
  type: string;
  active: boolean;
  triggerCount: number;
  lastTriggeredAt: string | null;
  createdAt: string;
};

export default function AlertsConsolePage() {
  const [alerts, setAlerts] = useState<AlertActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<AlertActivity[]>("/api/admin/alerts");
      setAlerts(res);
    } catch (err: any) {
      setError(err.message || "Failed to load system trigger activities");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  return (
    <div className="p-6 sm:p-8 flex flex-col gap-6 animate-card-enter">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-border-custom pb-4">
        <div>
          <h1 className="font-display text-xl tracking-[0.1em] text-red-custom uppercase">
            User Limit Activity Log
          </h1>
          <p className="font-mono text-[0.65rem] text-text-3 mt-1 uppercase">
            Audit trailing of user price threshold targets and notification deliveries
          </p>
        </div>
      </div>

      {error && (
        <div className="border border-red-custom/40 bg-red-dim/15 p-4 font-mono text-xs text-red-custom uppercase rounded">
          ⚠️ {error}
        </div>
      )}

      {/* Alerts Table */}
      <div className="border border-border-custom bg-bg-1 rounded overflow-hidden">
        {loading ? (
          <div className="p-8 text-center font-mono text-xs text-text-3 animate-pulse">
            LOADING LIMIT TRAIL DATA...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b border-border-custom bg-bg-2 text-text-2 uppercase text-[0.62rem] tracking-wider">
                  <th className="p-3">User</th>
                  <th className="p-3">Asset Symbol</th>
                  <th className="p-3">Trigger Type</th>
                  <th className="p-3 text-center">Active Status</th>
                  <th className="p-3 text-right">Trigger Count</th>
                  <th className="p-3 text-right">Last Triggered</th>
                </tr>
              </thead>
              <tbody>
                {alerts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-text-4">
                      No active threshold configurations found
                    </td>
                  </tr>
                ) : (
                  alerts.map((a) => (
                    <tr key={a.id} className="border-b border-border-custom/50 hover:bg-bg-2/30">
                      <td className="p-3 font-bold text-text-custom">@{a.username}</td>
                      <td className="p-3 text-text-custom font-bold">{a.symbol}</td>
                      <td className="p-3 text-text-2 uppercase">{a.type}</td>
                      <td className="p-3 text-center">
                        <span className={`px-1.5 py-0.2 rounded-sm text-[0.58rem] font-bold ${
                          a.active ? "bg-green-dim text-green-custom" : "bg-bg-3 text-text-4"
                        }`}>{a.active ? "ACTIVE" : "INACTIVE"}</span>
                      </td>
                      <td className="p-3 text-right text-text-custom">{a.triggerCount} times</td>
                      <td className="p-3 text-right text-text-4">
                        {a.lastTriggeredAt ? new Date(a.lastTriggeredAt).toLocaleString() : "Never"}
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
