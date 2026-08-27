"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";

type AuditLog = {
  id: string;
  username: string;
  role: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  ip: string | null;
  userAgent: string | null;
  meta: string | null;
  createdAt: string;
};

type AuditsResponse = {
  items: AuditLog[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<AuditsResponse>(`/api/admin/audit-logs?page=${page}&pageSize=15`);
      setLogs(res.items);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      setError(err.message || "Failed to load audit trails");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="p-6 sm:p-8 flex flex-col gap-6 animate-card-enter">
      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-border-custom pb-4 gap-3">
        <div>
          <h1 className="font-display text-xl tracking-[0.1em] text-red-custom uppercase">
            Platform Audit Trail Logs
          </h1>
          <p className="font-mono text-[0.65rem] text-text-3 mt-1 uppercase">
            Chronological log of administrative actions, role adjustments, and financial operations
          </p>
        </div>
        <Link
          href="/admin/settings"
          className="px-4 py-2 border border-border-custom hover:border-red-custom text-text-custom font-mono text-xs font-bold uppercase rounded no-underline"
        >
          ← Exit to Settings
        </Link>
      </div>

      {error && (
        <div className="border border-red-custom/40 bg-red-dim/15 p-4 font-mono text-xs text-red-custom uppercase rounded">
          ⚠️ {error}
        </div>
      )}

      {/* Audit logs Table */}
      <div className="border border-border-custom bg-bg-1 rounded overflow-hidden">
        {loading ? (
          <div className="p-8 text-center font-mono text-xs text-text-3 animate-pulse">
            LOADING AUDIT TRAILS...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b border-border-custom bg-bg-2 text-text-2 uppercase text-[0.62rem] tracking-wider">
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Admin User</th>
                  <th className="p-3">Action Type</th>
                  <th className="p-3">Target Entity</th>
                  <th className="p-3">Target ID</th>
                  <th className="p-3">IP Address</th>
                  <th className="p-3 text-right">Details (Meta)</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-text-4">
                      No security audit records logged
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-b border-border-custom/50 hover:bg-bg-2/30">
                      <td className="p-3 text-text-3 font-semibold">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="p-3 font-bold text-text-custom">
                        @{log.username} <span className="text-[0.6rem] text-red-custom uppercase font-bold">({log.role})</span>
                      </td>
                      <td className="p-3 text-red-custom font-bold">{log.action}</td>
                      <td className="p-3 text-text-2 uppercase">{log.entity || "-"}</td>
                      <td className="p-3 text-text-4 truncate max-w-[100px]" title={log.entityId || ""}>
                        {log.entityId || "-"}
                      </td>
                      <td className="p-3 text-text-3">{log.ip || "unknown"}</td>
                      <td className="p-3 text-right text-text-3 truncate max-w-[200px]" title={log.meta || ""}>
                        {log.meta || "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center font-mono text-xs mt-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-4 py-1.5 border border-border-custom bg-bg-1 text-text-custom hover:border-red-custom hover:text-red-custom disabled:opacity-40 disabled:cursor-not-allowed uppercase"
          >
            ← Previous
          </button>
          <span className="text-text-3">Page {page} of {totalPages}</span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-1.5 border border-border-custom bg-bg-1 text-text-custom hover:border-red-custom hover:text-red-custom disabled:opacity-40 disabled:cursor-not-allowed uppercase"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
