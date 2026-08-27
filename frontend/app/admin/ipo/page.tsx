"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api";

type IpoListing = {
  name: string;
  symbol?: string;
  status: "UPCOMING" | "OPEN" | "CLOSED" | "LISTED";
  openDate?: string;
  closeDate?: string;
  priceBand?: string;
  lotSize?: number;
  issueSize?: string;
  subscription?: number | null;
  source: string;
};

export default function IposListPage() {
  const [ipos, setIpos] = useState<IpoListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIpos = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<IpoListing[]>("/api/admin/ipo");
      setIpos(res);
    } catch (err: any) {
      setError(err.message || "Failed to load IPO feeds");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIpos();
  }, [fetchIpos]);

  return (
    <div className="p-6 sm:p-8 flex flex-col gap-6 animate-card-enter">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-border-custom pb-4">
        <div>
          <h1 className="font-display text-xl tracking-[0.1em] text-red-custom uppercase">
            Global IPO Listings
          </h1>
          <p className="font-mono text-[0.65rem] text-text-3 mt-1 uppercase">
            Track current and upcoming IPO open windows, size details, and listing details
          </p>
        </div>
      </div>

      {error && (
        <div className="border border-red-custom/40 bg-red-dim/15 p-4 font-mono text-xs text-red-custom uppercase rounded">
          ⚠️ {error}
        </div>
      )}

      {/* IPO Table Grid */}
      <div className="border border-border-custom bg-bg-1 rounded overflow-hidden font-mono text-xs">
        {loading ? (
          <div className="p-8 text-center text-text-3 animate-pulse">
            LOADING EXCHANGE IPO FEEDS...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border-custom bg-bg-2 text-text-2 uppercase text-[0.62rem] tracking-wider">
                  <th className="p-3">Company Name</th>
                  <th className="p-3">Ticker Symbol</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Price Band</th>
                  <th className="p-3 text-right">Issue Size</th>
                  <th className="p-3 text-right">Source Feed</th>
                </tr>
              </thead>
              <tbody>
                {ipos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-text-4">
                      No current or upcoming IPO listings configured in this workspace environment
                    </td>
                  </tr>
                ) : (
                  ipos.map((ipo, idx) => (
                    <tr key={idx} className="border-b border-border-custom/50 hover:bg-bg-2/30">
                      <td className="p-3 font-bold text-text-custom">{ipo.name}</td>
                      <td className="p-3 text-text-custom font-bold">{ipo.symbol || "N/A"}</td>
                      <td className="p-3 text-center">
                        <span className={`px-1.5 py-0.2 rounded-sm text-[0.58rem] font-bold uppercase ${
                          ipo.status === "OPEN" ? "bg-green-dim text-green-custom" :
                          ipo.status === "UPCOMING" ? "bg-amber-dim text-amber-custom" : "bg-bg-3 text-text-4"
                        }`}>{ipo.status}</span>
                      </td>
                      <td className="p-3 text-right text-text-custom">{ipo.priceBand || "N/A"}</td>
                      <td className="p-3 text-right text-text-2">{ipo.issueSize || "N/A"}</td>
                      <td className="p-3 text-right text-text-3 font-bold uppercase text-[0.6rem]">{ipo.source}</td>
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
