"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api";

type KycRecord = {
  id: string;
  userId: string;
  username: string;
  panNumber: string;
  documentType: string;
  amlStatus: string;
  amlMatchScore: number;
  kycStatus: "NOT_STARTED" | "PENDING" | "VERIFIED" | "REJECTED";
  updatedAt: string;
};

export default function KycManagementPage() {
  const [records, setRecords] = useState<KycRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active tab queue filter
  const [activeQueue, setActiveQueue] = useState<"PENDING" | "VERIFIED" | "REJECTED" | "ALL">("PENDING");

  // Selected Kyc Detail for Modal review
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const fetchKycRecords = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<KycRecord[]>("/api/admin/kyc");
      setRecords(res);
    } catch (err: any) {
      setError(err.message || "Failed to load KYC review logs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKycRecords();
  }, [fetchKycRecords]);

  const handleOpenReview = async (record: KycRecord) => {
    try {
      setDetailLoading(true);
      setRejectionReason("");
      const details = await api.get<any>(`/api/admin/kyc/${record.id}`);
      setSelectedRecord(details);
    } catch (err: any) {
      alert(err.message || "Failed to retrieve full KYC file");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleProcessReview = async (status: "VERIFIED" | "REJECTED") => {
    if (!selectedRecord) return;
    if (status === "REJECTED" && !rejectionReason.trim()) {
      alert("Please provide a rejection reason");
      return;
    }

    const confirmMsg = `Confirm KYC decision: set status to ${status} for user @${selectedRecord.user?.username || "user"}?`;
    if (!confirm(confirmMsg)) return;

    try {
      await api.post(`/api/admin/kyc/${selectedRecord.id}/review`, {
        status,
        reason: status === "REJECTED" ? rejectionReason : undefined,
      });

      alert(`KYC check completed successfully: set status to ${status}`);
      setSelectedRecord(null);
      fetchKycRecords();
    } catch (err: any) {
      alert(err.message || "Review processing failed");
    }
  };

  const filteredRecords = records.filter((r) => {
    if (activeQueue === "ALL") return true;
    return r.kycStatus === activeQueue;
  });

  return (
    <div className="p-6 sm:p-8 flex flex-col gap-6 animate-card-enter">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-border-custom pb-4">
        <div>
          <h1 className="font-display text-xl tracking-[0.1em] text-red-custom uppercase">
            KYC Compliance Center
          </h1>
          <p className="font-mono text-[0.65rem] text-text-3 mt-1 uppercase">
            Verify user identity uploads, check AML scores, and process credentials
          </p>
        </div>
      </div>

      {error && (
        <div className="border border-red-custom/40 bg-red-dim/15 p-4 font-mono text-xs text-red-custom uppercase rounded">
          ⚠️ {error}
        </div>
      )}

      {/* Tabs Filter Queue */}
      <div className="flex bg-bg-2 border border-border-custom p-0.5 rounded self-start font-mono text-xs">
        {(["PENDING", "VERIFIED", "REJECTED", "ALL"] as const).map((q) => (
          <button
            key={q}
            onClick={() => setActiveQueue(q)}
            className={`px-3 py-1.5 uppercase tracking-wider cursor-pointer transition-colors font-bold ${
              activeQueue === q ? "bg-red-dim text-red-custom" : "text-text-2 hover:text-text-custom"
            }`}
          >
            {q === "ALL" ? "History Log" : q}
          </button>
        ))}
      </div>

      {/* KYC Table Grid */}
      <div className="border border-border-custom bg-bg-1 rounded overflow-hidden">
        {loading ? (
          <div className="p-8 text-center font-mono text-xs text-text-3 animate-pulse">
            LOADING COMPLIANCE RECORDS...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b border-border-custom bg-bg-2 text-text-2 uppercase text-[0.62rem] tracking-wider">
                  <th className="p-3">User</th>
                  <th className="p-3">Doc Type</th>
                  <th className="p-3">Masked ID (PAN)</th>
                  <th className="p-3 text-center">AML Match</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Review</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-text-4">
                      No matching compliance entries in this queue
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r) => (
                    <tr key={r.id} className="border-b border-border-custom/50 hover:bg-bg-2/30">
                      <td className="p-3 font-bold text-text-custom">@{r.username}</td>
                      <td className="p-3 text-text-2 uppercase">{r.documentType}</td>
                      <td className="p-3 text-text-2">{r.panNumber}</td>
                      <td className="p-3 text-center">
                        <span className={`px-1.5 py-0.2 rounded-sm text-[0.58rem] font-bold ${
                          r.amlStatus === "PASSED" ? "bg-green-dim text-green-custom" : "bg-red-dim text-red-custom"
                        }`}>{r.amlStatus} ({r.amlMatchScore * 100}%)</span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-1.5 py-0.2 rounded-sm text-[0.58rem] font-bold ${
                          r.kycStatus === "VERIFIED" ? "bg-green-dim text-green-custom" :
                          r.kycStatus === "PENDING" ? "bg-amber-dim text-amber-custom" : "bg-red-dim text-red-custom"
                        }`}>{r.kycStatus}</span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleOpenReview(r)}
                          className="px-3 py-1 border border-red-custom hover:bg-red-custom hover:text-bg text-red-custom rounded font-bold text-[0.62rem] uppercase transition-all duration-150 cursor-pointer"
                        >
                          Review File
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

      {/* Review Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-4">
          <div className="bg-bg-1 border border-border-custom max-w-lg w-full p-6 rounded flex flex-col gap-4 font-mono text-xs relative max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-sm text-red-custom uppercase border-b border-border-custom pb-2">
              Identity Verification File: @{selectedRecord.user?.username || "user"}
            </h3>

            <div className="flex flex-col gap-2 bg-bg-2 p-3 border border-border-custom">
              <div className="flex justify-between">
                <span className="text-text-3">Full Legal Name:</span>
                <span className="text-text-custom font-bold">{selectedRecord.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-3">Birth Date:</span>
                <span className="text-text-custom font-bold">{selectedRecord.birthDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-3">Document Class:</span>
                <span className="text-text-custom font-bold uppercase">{selectedRecord.documentType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-3">Masked ID Number:</span>
                <span className="text-text-custom font-bold">{selectedRecord.panNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-3">Registered Address:</span>
                <span className="text-text-custom font-bold text-right max-w-[200px] truncate" title={selectedRecord.address}>
                  {selectedRecord.address}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 border border-border-custom bg-bg-2/30 p-3 rounded">
              <span className="text-[0.62rem] text-text-3 uppercase font-bold">AML Risk Compliance Check:</span>
              <div className="flex justify-between mt-1">
                <span>AML Score Match:</span>
                <span className="font-bold text-text-custom">{(selectedRecord.amlMatchScore * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span>AML Risk Clear:</span>
                <span className={`font-bold uppercase ${selectedRecord.amlStatus === "PASSED" ? "text-green-custom" : "text-red-custom"}`}>
                  {selectedRecord.amlStatus}
                </span>
              </div>
            </div>

            {selectedRecord.user?.kycStatus === "PENDING" && (
              <div className="flex flex-col gap-2 mt-2">
                <label className="text-text-3 uppercase text-[0.62rem]">Rejection Reason (If rejecting):</label>
                <input
                  type="text"
                  placeholder="Describe failure reason details..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="bg-bg border border-border-custom text-text-custom p-2 focus:outline-none placeholder:text-text-4"
                />
              </div>
            )}

            <div className="flex justify-between gap-2 mt-4">
              <button
                onClick={() => setSelectedRecord(null)}
                className="px-4 py-2 border border-border-custom hover:border-text-custom text-text-custom font-bold uppercase transition-all duration-150 cursor-pointer"
              >
                Close File
              </button>

              {selectedRecord.user?.kycStatus === "PENDING" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleProcessReview("REJECTED")}
                    className="px-4 py-2 border border-red-custom text-red-custom hover:bg-red-custom hover:text-bg font-bold uppercase transition-all duration-150 cursor-pointer"
                  >
                    Reject KYC
                  </button>
                  <button
                    onClick={() => handleProcessReview("VERIFIED")}
                    className="px-4 py-2 bg-green-custom text-bg border-none font-bold uppercase hover:bg-opacity-90 transition-all duration-150 cursor-pointer"
                  >
                    Verify KYC
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
