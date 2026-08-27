"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, apiFetch } from "../../../lib/api";

type Profile = {
  experience: string;
  riskTolerance: string;
  horizonYears: number;
  monthlyInvestment: number;
  preferredMarkets: string;
  preferredAssets: string;
  baseCurrency: string;
};

type Holding = {
  id: string;
  stock: string;
  displaySym: string;
  exchange: string;
  avgPrice: number;
  quantity: number;
  currency: string;
};

type Transaction = {
  id: string;
  stock: string;
  type: string;
  price: number;
  quantity: number;
  totalCost: number;
  currency: string;
  createdAt: string;
};

type Alert = {
  id: string;
  symbol: string | null;
  type: string;
  threshold: number | null;
  active: boolean;
  triggerCount: number;
};

type UserDetail = {
  id: string;
  deviceId: string;
  username: string;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  role: string;
  status: "ACTIVE" | "SUSPENDED";
  kycStatus: string;
  walletInr: number;
  walletUsd: number;
  createdAt: string;
  lastLoginAt: string | null;
  profile: Profile | null;
  watchlist: any[];
  holdings: Holding[];
  transactions: Transaction[];
  goals: any[];
  alerts: Alert[];
};

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const userId = resolvedParams.id;

  const [user, setUser] = useState<UserDetail | null>(null);
  const [adminUser, setAdminUser] = useState<{ role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Adjust balance states
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustCurrency, setAdjustCurrency] = useState<"INR" | "USD">("INR");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  // Role updating states
  const [newRole, setNewRole] = useState("");
  const [updatingRole, setUpdatingRole] = useState(false);

  const fetchUserDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get<UserDetail>(`/api/admin/users/${userId}`);
      setUser(data);
      setNewRole(data.role);

      const admin = await apiFetch<{ role: string }>("/api/user");
      setAdminUser(admin);
    } catch (err: any) {
      setError(err.message || "Failed to load user operational logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserDetails();
  }, [userId]);

  const handleAdjustWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(adjustAmount);
    if (isNaN(amount) || amount === 0) {
      alert("Please enter a valid non-zero adjustment amount");
      return;
    }
    if (!adjustReason.trim() || adjustReason.length < 5) {
      alert("Reason must be at least 5 characters long");
      return;
    }

    const typeStr = amount > 0 ? "ADD" : "REMOVE";
    const confirmMsg = `CONFIRM DEPOSIT/WITHDRAWAL ACTION:\n\nYou are about to ${typeStr} ${Math.abs(amount)} ${adjustCurrency} to/from @${user?.username}'s wallet.\n\nReason: "${adjustReason}"\n\nDo you want to proceed?`;
    if (!confirm(confirmMsg)) return;

    try {
      setAdjusting(true);
      const res = await api.post<{ newValue: number }>(`/api/admin/users/${userId}/adjust-wallet`, {
        currency: adjustCurrency,
        amount,
        reason: adjustReason.trim(),
      });

      alert("Wallet adjusted successfully");
      setAdjustAmount("");
      setAdjustReason("");
      setUser((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          walletInr: adjustCurrency === "INR" ? res.newValue : prev.walletInr,
          walletUsd: adjustCurrency === "USD" ? res.newValue : prev.walletUsd,
        };
      });
    } catch (err: any) {
      alert(err.message || "Adjustment failed");
    } finally {
      setAdjusting(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!user || newRole === user.role) return;
    if (!confirm(`Are you sure you want to change @${user.username}'s role to ${newRole}?`)) return;

    try {
      setUpdatingRole(true);
      await api.patch(`/api/admin/users/${userId}/role`, { role: newRole });
      alert("User role updated successfully");
      setUser((prev) => (prev ? { ...prev, role: newRole } : null));
    } catch (err: any) {
      alert(err.message || "Failed to update role");
    } finally {
      setUpdatingRole(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 font-mono text-xs text-text-3 animate-pulse">
        GATHERING ACCOUNT INFORMATION...
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="p-8 flex flex-col gap-4 font-mono">
        <div className="border border-red-custom/40 bg-red-dim/10 p-4 text-xs text-red-custom rounded">
          ⚠️ ERROR: {error || "User record not found"}
        </div>
        <Link href="/admin/users" className="text-text-custom hover:text-red-custom text-xs uppercase font-bold no-underline">
          ← Return to Directory
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 flex flex-col gap-6 animate-card-enter">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-border-custom pb-4 gap-3">
        <div>
          <span className="font-mono text-[0.62rem] text-text-3 uppercase block">Account Detail Card</span>
          <h1 className="font-display text-xl tracking-[0.1em] text-red-custom uppercase">
            @{user.username}
          </h1>
        </div>
        <Link
          href="/admin/users"
          className="px-4 py-2 border border-border-custom hover:border-red-custom text-text-custom font-mono text-xs font-bold uppercase rounded no-underline"
        >
          ← Exit to Directory
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Profile and Meta Grid */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Profile Overview */}
          <div className="border border-border-custom bg-bg-1 p-5 rounded flex flex-col gap-4">
            <h3 className="font-mono text-xs font-bold text-text-custom uppercase border-b border-border-custom pb-2">// Profile & KYC Status</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-xs">
              <div className="flex flex-col gap-0.5">
                <span className="text-text-3 uppercase text-[0.62rem]">Full Name:</span>
                <span className="text-text-custom font-bold">{user.fullName || "N/A"}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-text-3 uppercase text-[0.62rem]">Email Address:</span>
                <span className="text-text-custom font-bold">{user.email || "N/A"}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-text-3 uppercase text-[0.62rem]">Identity Status:</span>
                <span className="text-text-custom font-bold uppercase">{user.kycStatus}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-text-3 uppercase text-[0.62rem]">Role Status:</span>
                <span className="text-text-custom font-bold uppercase">{user.role}</span>
              </div>
            </div>
          </div>

          {/* Holdings List */}
          <div className="border border-border-custom bg-bg-1 p-5 rounded flex flex-col gap-3">
            <h3 className="font-mono text-xs font-bold text-text-custom uppercase border-b border-border-custom pb-2">// Active Asset Holdings</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[0.7rem] border-collapse">
                <thead>
                  <tr className="border-b border-border-custom bg-bg-2/30 text-text-3 uppercase text-[0.6rem]">
                    <th className="p-2">Asset Symbol</th>
                    <th className="p-2">Exchange</th>
                    <th className="p-2 text-right">Avg Buy Price</th>
                    <th className="p-2 text-right">Qty Owned</th>
                  </tr>
                </thead>
                <tbody>
                  {user.holdings.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-text-4">No active stock holdings found</td>
                    </tr>
                  ) : (
                    user.holdings.map((h) => (
                      <tr key={h.id} className="border-b border-border-custom/50">
                        <td className="p-2 font-bold text-text-custom">{h.displaySym}</td>
                        <td className="p-2 uppercase text-text-3">{h.exchange}</td>
                        <td className="p-2 text-right text-text-custom">
                          {h.currency === "INR" ? "₹" : "$"}
                          {h.avgPrice.toFixed(2)}
                        </td>
                        <td className="p-2 text-right text-text-custom font-semibold">{h.quantity}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Alert Configs */}
          <div className="border border-border-custom bg-bg-1 p-5 rounded flex flex-col gap-3">
            <h3 className="font-mono text-xs font-bold text-text-custom uppercase border-b border-border-custom pb-2">// User Trigger Limits</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[0.7rem] border-collapse">
                <thead>
                  <tr className="border-b border-border-custom bg-bg-2/30 text-text-3 uppercase text-[0.6rem]">
                    <th className="p-2">Symbol</th>
                    <th className="p-2">Trigger Type</th>
                    <th className="p-2 text-right">Threshold</th>
                    <th className="p-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {user.alerts.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-text-4">No alerts configured</td>
                    </tr>
                  ) : (
                    user.alerts.map((a) => (
                      <tr key={a.id} className="border-b border-border-custom/50">
                        <td className="p-2 font-bold text-text-custom">{a.symbol || "GLOBAL"}</td>
                        <td className="p-2 text-text-2 uppercase">{a.type}</td>
                        <td className="p-2 text-right text-text-custom">{a.threshold || "-"}</td>
                        <td className="p-2 text-right">
                          <span className={`px-1 py-0.2 rounded-sm text-[0.58rem] font-bold ${
                            a.active ? "bg-green-dim text-green-custom" : "bg-bg-3 text-text-4"
                          }`}>{a.active ? "ACTIVE" : "INACTIVE"}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Action / Adjuster Console */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Wallet adjust console */}
          <div className="border border-border-custom bg-bg-1 p-5 rounded flex flex-col gap-4">
            <h3 className="font-mono text-xs font-bold text-text-custom uppercase border-b border-border-custom pb-2">// Adjustment Console</h3>
            <div className="font-mono text-xs flex flex-col gap-1 mb-2 bg-bg-2/40 p-3 border border-border-custom">
              <div className="flex justify-between text-text-3 uppercase text-[0.65rem]">
                <span>INR Balance:</span>
                <span className="font-bold text-text-custom">₹{user.walletInr.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-text-3 uppercase text-[0.65rem] mt-1">
                <span>USD Balance:</span>
                <span className="font-bold text-text-custom">${user.walletUsd.toLocaleString()}</span>
              </div>
            </div>

            <form onSubmit={handleAdjustWallet} className="flex flex-col gap-3 font-mono text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-text-3 uppercase text-[0.62rem]">Currency:</label>
                <select
                  value={adjustCurrency}
                  onChange={(e) => setAdjustCurrency(e.target.value as any)}
                  className="bg-bg border border-border-custom text-text-custom p-2 focus:outline-none"
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-text-3 uppercase text-[0.62rem]">Adjustment Amount:</label>
                <input
                  type="number"
                  placeholder="e.g. 5000 (negative to deduct)"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  className="bg-bg border border-border-custom text-text-custom p-2 focus:outline-none placeholder:text-text-4"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-text-3 uppercase text-[0.62rem]">Audit Log Reason:</label>
                <input
                  type="text"
                  placeholder="Minimum 5 characters"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="bg-bg border border-border-custom text-text-custom p-2 focus:outline-none placeholder:text-text-4"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={adjusting}
                className="w-full py-2 border border-red-custom bg-red-custom hover:bg-opacity-80 text-bg font-bold uppercase transition-all duration-150 cursor-pointer disabled:opacity-50"
              >
                {adjusting ? "Processing..." : "Process Adjustment"}
              </button>
            </form>
          </div>

          {/* Admin Role Promoters (SUPER_ADMIN ONLY) */}
          {adminUser?.role === "SUPER_ADMIN" && (
            <div className="border border-border-custom bg-bg-1 p-5 rounded flex flex-col gap-4">
              <h3 className="font-mono text-xs font-bold text-text-custom uppercase border-b border-border-custom pb-2">// Promote/Demote Role</h3>
              <div className="flex flex-col gap-3 font-mono text-xs">
                <div className="flex flex-col gap-1">
                  <label className="text-text-3 uppercase text-[0.62rem]">Target Access Role:</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="bg-bg border border-border-custom text-text-custom p-2 focus:outline-none"
                  >
                    <option value="USER">USER</option>
                    <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="KYC_ADMIN">KYC_ADMIN</option>
                    <option value="CONTENT_ADMIN">CONTENT_ADMIN</option>
                    <option value="SUPPORT_ADMIN">SUPPORT_ADMIN</option>
                  </select>
                </div>

                <button
                  onClick={handleUpdateRole}
                  disabled={updatingRole || newRole === user.role}
                  className="w-full py-2 border border-red-custom hover:bg-red-custom/10 text-red-custom font-bold uppercase transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updatingRole ? "Saving..." : "Apply Role Change"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
