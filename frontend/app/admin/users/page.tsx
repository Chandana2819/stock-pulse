"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "../../lib/api";

type User = {
  id: string;
  username: string;
  email: string | null;
  role: string;
  status: "ACTIVE" | "SUSPENDED";
  kycStatus: "NOT_STARTED" | "PENDING" | "VERIFIED" | "REJECTED";
  createdAt: string;
  lastLoginAt: string | null;
};

type UsersResponse = {
  items: User[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export default function UsersManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [kycStatus, setKycStatus] = useState("");

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const queryParams = new URLSearchParams({
        page: String(page),
        search: search.trim(),
        status,
        kycStatus,
      });

      const res = await api.get<UsersResponse>(`/api/admin/users?${queryParams.toString()}`);
      setUsers(res.items);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      setError(err.message || "Failed to load user directories");
    } finally {
      setLoading(false);
    }
  }, [page, search, status, kycStatus]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleToggleStatus = async (user: User) => {
    const newStatus = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    if (
      !confirm(
        `Are you sure you want to change user @${user.username} status to ${newStatus}?`
      )
    ) {
      return;
    }

    try {
      await api.patch(`/api/admin/users/${user.id}/status`, { status: newStatus });
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, status: newStatus } : u))
      );
    } catch (err: any) {
      alert(err.message || "Failed to toggle account status");
    }
  };

  return (
    <div className="p-6 sm:p-8 flex flex-col gap-6 animate-card-enter">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-border-custom pb-4">
        <div>
          <h1 className="font-display text-xl tracking-[0.1em] text-red-custom uppercase">
            User Accounts Directory
          </h1>
          <p className="font-mono text-[0.65rem] text-text-3 mt-1 uppercase">
            Search, filter, suspend, and view detailed user profiles
          </p>
        </div>
      </div>

      {error && (
        <div className="border border-red-custom/40 bg-red-dim/15 p-4 font-mono text-xs text-red-custom uppercase rounded">
          ⚠️ {error}
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-bg-1 border border-border-custom p-4 rounded font-mono text-xs">
        <div className="flex flex-col gap-1.5">
          <label className="text-text-3 uppercase text-[0.62rem]">Search User:</label>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Username or email..."
            className="w-full bg-bg border border-border-custom text-text-custom p-2 focus:border-red-custom focus:outline-none placeholder:text-text-4"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-text-3 uppercase text-[0.62rem]">Account Status:</label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="w-full bg-bg border border-border-custom text-text-custom p-2 focus:border-red-custom focus:outline-none"
          >
            <option value="">ALL STATUSES</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="SUSPENDED">SUSPENDED</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-text-3 uppercase text-[0.62rem]">KYC Status:</label>
          <select
            value={kycStatus}
            onChange={(e) => {
              setKycStatus(e.target.value);
              setPage(1);
            }}
            className="w-full bg-bg border border-border-custom text-text-custom p-2 focus:border-red-custom focus:outline-none"
          >
            <option value="">ALL KYC STATUSES</option>
            <option value="NOT_STARTED">NOT STARTED</option>
            <option value="PENDING">PENDING</option>
            <option value="VERIFIED">VERIFIED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </div>

        <div className="flex items-end justify-end">
          <button
            onClick={() => {
              setSearch("");
              setStatus("");
              setKycStatus("");
              setPage(1);
            }}
            className="w-full sm:w-auto px-4 py-2 bg-bg border border-border-custom hover:border-red-custom text-text-custom font-bold uppercase transition-all duration-150"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="border border-border-custom bg-bg-1 rounded overflow-hidden">
        {loading ? (
          <div className="p-8 text-center font-mono text-xs text-text-3 animate-pulse">
            LOADING USERS RECORDS...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b border-border-custom bg-bg-2 text-text-2 uppercase text-[0.62rem] tracking-wider">
                  <th className="p-3">Username</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Joined</th>
                  <th className="p-3">Last Active</th>
                  <th className="p-3 text-center">Role</th>
                  <th className="p-3 text-center">KYC</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-text-4">
                      No matching user records found
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="border-b border-border-custom/50 hover:bg-bg-2/30">
                      <td className="p-3 font-bold text-text-custom">
                        <Link href={`/admin/users/${u.id}`} className="text-text-custom hover:text-red-custom no-underline">
                          @{u.username}
                        </Link>
                      </td>
                      <td className="p-3 text-text-2">{u.email || "N/A"}</td>
                      <td className="p-3 text-text-3">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="p-3 text-text-3">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}
                      </td>
                      <td className="p-3 text-center uppercase text-[0.62rem] text-text-3">{u.role}</td>
                      <td className="p-3 text-center">
                        <span className={`px-1.5 py-0.2 rounded-sm text-[0.58rem] font-bold ${
                          u.kycStatus === "VERIFIED" ? "bg-green-dim text-green-custom" :
                          u.kycStatus === "PENDING" ? "bg-amber-dim text-amber-custom" : "bg-bg-3 text-text-4"
                        }`}>{u.kycStatus}</span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-1.5 py-0.2 rounded-sm text-[0.58rem] font-bold ${
                          u.status === "ACTIVE" ? "bg-green-dim text-green-custom" : "bg-red-dim text-red-custom"
                        }`}>{u.status}</span>
                      </td>
                      <td className="p-3 text-right flex justify-end gap-2">
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="px-2.5 py-1 border border-border-custom hover:border-text-custom text-text-custom rounded no-underline tracking-wider text-[0.6rem] font-bold uppercase transition-all"
                        >
                          Details
                        </Link>
                        <button
                          onClick={() => handleToggleStatus(u)}
                          className={`px-2.5 py-1 border rounded font-mono text-[0.6rem] font-bold tracking-wider uppercase cursor-pointer transition-all ${
                            u.status === "ACTIVE"
                              ? "border-red-custom text-red-custom hover:bg-red-custom hover:text-bg"
                              : "border-green-custom text-green-custom hover:bg-green-custom hover:text-bg"
                          }`}
                        >
                          {u.status === "ACTIVE" ? "Suspend" : "Activate"}
                        </button>
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
