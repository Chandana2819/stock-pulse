"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "../lib/api";

type DashboardMetrics = {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  kycPending: number;
  kycVerified: number;
  kycFailed: number;
  totalPortfolios: number;
  triggeredAlerts: number;
  activeAlerts: number;
  communityPosts: number;
  systemHealth: "HEALTHY" | "WARNING" | "ERROR";
  zerodhaTotalConnected?: number;
  zerodhaActiveConnections?: number;
  zerodhaFailedConnections?: number;
  zerodhaLastSyncTime?: string | null;
  zerodhaSyncFailures?: number;
};

type RecentUser = {
  id: string;
  username: string;
  email: string | null;
  role: string;
  kycStatus: string;
  status: string;
  createdAt: string;
};

type RecentKyc = {
  id: string;
  username: string;
  panNumber: string;
  documentType: string;
  amlStatus: string;
  updatedAt: string;
};

type RecentActivity = {
  id: string;
  username: string;
  role: string;
  action: string;
  createdAt: string;
};

type DashboardData = {
  metrics: DashboardMetrics;
  recentUsers: RecentUser[];
  recentKyc: RecentKyc[];
  recentAdminActivity: RecentActivity[];
};

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<DashboardData>("/api/admin/dashboard");
      setData(res);
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  if (loading) {
    return (
      <div className="p-8 font-mono text-xs text-text-3 animate-pulse">
        COLLECTING OPERATIONAL STATE METRICS...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 flex flex-col gap-4 font-mono">
        <div className="border border-red-custom/40 bg-red-dim/10 p-4 text-xs text-red-custom rounded">
          ⚠️ ERROR: {error || "Unable to retrieve dashboard aggregates"}
        </div>
        <button
          onClick={fetchDashboardData}
          className="px-4 py-2 bg-bg-2 border border-border-custom hover:border-red-custom text-text-custom text-xs font-bold uppercase transition-all"
        >
          Retry Load
        </button>
      </div>
    );
  }

  const { metrics, recentUsers, recentKyc, recentAdminActivity } = data;

  return (
    <div className="p-6 sm:p-8 flex flex-col gap-8 animate-card-enter">
      {/* Title */}
      <div>
        <h1 className="font-display text-xl tracking-[0.1em] text-red-custom uppercase">
          OPERATIONAL STATE CONSOLE
        </h1>
        <p className="font-mono text-[0.65rem] text-text-3 mt-1 uppercase tracking-wider">
          Aggregated status indicators, user registration metrics, and security audits
        </p>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Users */}
        <div className="border border-border-custom bg-bg-1 p-5 rounded relative overflow-hidden group">
          <span className="font-mono text-[0.58rem] text-text-3 uppercase tracking-wider block mb-1">
            Total Accounts
          </span>
          <span className="font-mono text-2xl font-bold text-text-custom">{metrics.totalUsers}</span>
          <span className="font-mono text-[0.58rem] text-text-4 block mt-1.5 uppercase">
            {metrics.activeUsers} Active • {metrics.suspendedUsers} Suspended
          </span>
        </div>

        {/* KYC Reviews */}
        <div className="border border-border-custom bg-bg-1 p-5 rounded relative overflow-hidden group">
          <span className="font-mono text-[0.58rem] text-text-3 uppercase tracking-wider block mb-1">
            KYC VERIFICATION
          </span>
          <span className="font-mono text-2xl font-bold text-text-custom">{metrics.kycVerified}</span>
          <span className="font-mono text-[0.58rem] text-text-4 block mt-1.5 uppercase">
            <span className="text-amber-custom font-bold">{metrics.kycPending} Pending</span> • {metrics.kycFailed} Failed
          </span>
        </div>

        {/* Portfolios */}
        <div className="border border-border-custom bg-bg-1 p-5 rounded relative overflow-hidden group">
          <span className="font-mono text-[0.58rem] text-text-3 uppercase tracking-wider block mb-1">
            Total Portfolios
          </span>
          <span className="font-mono text-2xl font-bold text-text-custom">{metrics.totalPortfolios}</span>
          <span className="font-mono text-[0.58rem] text-text-4 block mt-1.5 uppercase">
            Active asset holding lists
          </span>
        </div>

        {/* Triggered Alerts */}
        <div className="border border-border-custom bg-bg-1 p-5 rounded relative overflow-hidden group">
          <span className="font-mono text-[0.58rem] text-text-3 uppercase tracking-wider block mb-1">
            Alerts Triggered
          </span>
          <span className="font-mono text-2xl font-bold text-text-custom">{metrics.triggeredAlerts}</span>
          <span className="font-mono text-[0.58rem] text-text-4 block mt-1.5 uppercase text-red-custom">
            Active tracking limits: {metrics.activeAlerts}
          </span>
        </div>

        {/* System Health */}
        <div className="border border-border-custom bg-bg-1 p-5 rounded relative overflow-hidden group">
          <span className="font-mono text-[0.58rem] text-text-3 uppercase tracking-wider block mb-1">
            Database Health
          </span>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${metrics.systemHealth === "HEALTHY" ? "bg-green-custom" : "bg-red-custom"}`} />
            <span className="font-mono text-2xl font-bold text-text-custom uppercase">
              {metrics.systemHealth}
            </span>
          </div>
          <span className="font-mono text-[0.58rem] text-text-4 block mt-1.5 uppercase">
            Prisma connector status
          </span>
        </div>
      </div>

      {/* Zerodha Kite Connect Integration Console */}
      <div className="border border-border-custom bg-bg-1 p-6 rounded flex flex-col gap-4">
        <div>
          <h2 className="font-display text-sm tracking-[0.1em] text-red-custom uppercase">
            ZERODHA KITE CONNECT INTEGRATION
          </h2>
          <p className="font-mono text-[0.6rem] text-text-3 mt-0.5 uppercase tracking-wider">
            Operational statuses of synced Demat accounts and connection metrics
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-bg-2/30 p-4 border border-border-custom rounded">
            <span className="font-mono text-[0.55rem] text-text-3 uppercase tracking-wider block mb-1">
              Connected Accounts
            </span>
            <span className="font-mono text-xl font-bold text-text-custom">
              {metrics.zerodhaActiveConnections || 0}
            </span>
            <span className="font-mono text-[0.55rem] text-text-4 block mt-1 uppercase">
              Total registrations: {metrics.zerodhaTotalConnected || 0}
            </span>
          </div>

          <div className="bg-bg-2/30 p-4 border border-border-custom rounded">
            <span className="font-mono text-[0.55rem] text-text-3 uppercase tracking-wider block mb-1">
              Broken Connections
            </span>
            <span className="font-mono text-xl font-bold text-red-custom">
              {metrics.zerodhaFailedConnections || 0}
            </span>
            <span className="font-mono text-[0.55rem] text-text-4 block mt-1 uppercase">
              Authentication errors
            </span>
          </div>

          <div className="bg-bg-2/30 p-4 border border-border-custom rounded">
            <span className="font-mono text-[0.55rem] text-text-3 uppercase tracking-wider block mb-1">
              Sync Failures
            </span>
            <span className="font-mono text-xl font-bold text-text-custom">
              {metrics.zerodhaSyncFailures || 0}
            </span>
            <span className="font-mono text-[0.55rem] text-text-4 block mt-1 uppercase">
              Failed API requests
            </span>
          </div>

          <div className="bg-bg-2/30 p-4 border border-border-custom rounded">
            <span className="font-mono text-[0.55rem] text-text-3 uppercase tracking-wider block mb-1">
              Last Sync Event
            </span>
            <span className="font-mono text-xs font-bold text-text-custom block truncate mt-1">
              {metrics.zerodhaLastSyncTime
                ? new Date(metrics.zerodhaLastSyncTime).toLocaleString("en-US", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })
                : "NEVER"}
            </span>
            <span className="font-mono text-[0.55rem] text-text-4 block mt-1 uppercase">
              Most recent update
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Recent Users & KYC Queue */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Recent Registrations */}
          <div className="border border-border-custom bg-bg-1 p-5 rounded flex flex-col gap-3">
            <div className="flex justify-between items-center border-b border-border-custom pb-2">
              <h3 className="font-mono text-xs font-bold text-text-custom uppercase">Recent Registrations</h3>
              <Link href="/admin/users" className="font-mono text-[0.62rem] text-red-custom uppercase font-bold no-underline hover:underline">
                View All Users →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[0.7rem] border-collapse">
                <thead>
                  <tr className="border-b border-border-custom bg-bg-2/30 text-text-3 uppercase text-[0.6rem]">
                    <th className="p-2">User</th>
                    <th className="p-2">Email</th>
                    <th className="p-2">Role</th>
                    <th className="p-2">KYC</th>
                    <th className="p-2 text-right">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {recentUsers.map((u) => (
                    <tr key={u.id} className="border-b border-border-custom/50 hover:bg-bg-2/20">
                      <td className="p-2 font-bold text-text-custom">@{u.username}</td>
                      <td className="p-2 text-text-2">{u.email || "N/A"}</td>
                      <td className="p-2 uppercase text-text-3">{u.role}</td>
                      <td className="p-2">
                        <span className={`px-1 py-0.2 rounded-sm text-[0.58rem] font-bold ${
                          u.kycStatus === "VERIFIED" ? "bg-green-dim text-green-custom" :
                          u.kycStatus === "PENDING" ? "bg-amber-dim text-amber-custom" : "bg-bg-3 text-text-4"
                        }`}>{u.kycStatus}</span>
                      </td>
                      <td className="p-2 text-right text-text-4">{new Date(u.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* KYC Review Queue */}
          <div className="border border-border-custom bg-bg-1 p-5 rounded flex flex-col gap-3">
            <div className="flex justify-between items-center border-b border-border-custom pb-2">
              <h3 className="font-mono text-xs font-bold text-text-custom uppercase">KYC Verification Queue</h3>
              <Link href="/admin/kyc" className="font-mono text-[0.62rem] text-red-custom uppercase font-bold no-underline hover:underline">
                Open Review Desk →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[0.7rem] border-collapse">
                <thead>
                  <tr className="border-b border-border-custom bg-bg-2/30 text-text-3 uppercase text-[0.6rem]">
                    <th className="p-2">User</th>
                    <th className="p-2">PAN Document</th>
                    <th className="p-2">Doc Type</th>
                    <th className="p-2 text-right">AML Match</th>
                  </tr>
                </thead>
                <tbody>
                  {recentKyc.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-text-4">No recent KYC submissions</td>
                    </tr>
                  ) : (
                    recentKyc.map((k) => (
                      <tr key={k.id} className="border-b border-border-custom/50 hover:bg-bg-2/20">
                        <td className="p-2 font-bold text-text-custom">@{k.username}</td>
                        <td className="p-2 text-text-2">{k.panNumber}</td>
                        <td className="p-2 text-text-3 uppercase">{k.documentType}</td>
                        <td className="p-2 text-right text-text-4">{k.amlStatus}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Side: Recent Admin Logs */}
        <div className="lg:col-span-4 border border-border-custom bg-bg-1 p-5 rounded flex flex-col gap-3 h-full">
          <div className="flex justify-between items-center border-b border-border-custom pb-2">
            <h3 className="font-mono text-xs font-bold text-text-custom uppercase">Recent Security Audits</h3>
            <Link href="/admin/settings" className="font-mono text-[0.62rem] text-red-custom uppercase font-bold no-underline hover:underline">
              Audit Logs →
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {recentAdminActivity.length === 0 ? (
              <div className="text-center font-mono text-xs text-text-4 py-8">No security actions recorded yet</div>
            ) : (
              recentAdminActivity.map((log) => (
                <div key={log.id} className="p-2.5 bg-bg-2/30 border border-border-custom/50 rounded flex flex-col gap-1 font-mono text-[0.68rem]">
                  <div className="flex justify-between text-text-3">
                    <span className="font-bold text-red-custom">@{log.username} ({log.role})</span>
                    <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-text-custom font-semibold truncate uppercase">{log.action}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
