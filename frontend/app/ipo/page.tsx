"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Listing = {
  name: string;
  status: string;
  openDate?: string;
  closeDate?: string;
  priceBand?: string;
  lotSize?: number;
  issueSize?: string;
  subscription?: number | null;
  gmp?: number | null;
  gmpPct?: number | null;
  qibSub?: number | null;
  niiSub?: number | null;
  retailSub?: number | null;
};

export default function IpoPage() {
  const [data, setData] = useState<{ configured: boolean; listings: Listing[]; note?: string } | null>(null);

  useEffect(() => {
    api.get<{ configured: boolean; listings: Listing[]; note?: string }>("/api/ipo")
      .then(setData)
      .catch(() => setData(null));
  }, []);

  return (
    <div className="max-w-[900px] mx-auto w-full p-4 sm:p-8 flex flex-col gap-6 animate-card-enter">
      <div>
        <h1 className="font-display text-2xl tracking-[0.1em] text-text-custom uppercase">IPO CENTER</h1>
        <p className="font-mono text-[0.65rem] text-text-3 mt-1">Upcoming, open and recently closed IPOs with Grey Market Premiums.</p>
      </div>

      {data && !data.configured && (
        <div className="border border-amber-custom/40 bg-amber-dim p-5 font-mono text-xs text-amber-custom leading-relaxed">
          {data.note}
        </div>
      )}

      {data && data.listings.length === 0 && data.configured && (
        <div className="border border-border-custom bg-bg-1 p-10 text-center font-mono text-xs text-text-3 uppercase">
          No IPOs currently listed in the system.
        </div>
      )}

      {data && data.listings.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.listings.map((l, i) => (
            <div key={i} className="border border-border-bright bg-bg-1 p-5 flex flex-col gap-3 rounded">
              <div className="flex items-center justify-between">
                <span className="font-display text-lg text-text-custom tracking-[0.05em] uppercase">{l.name}</span>
                <span className={`font-mono text-[0.55rem] px-2 py-0.5 border uppercase rounded-sm ${
                  l.status === "OPEN" ? "border-green-custom/30 text-green-custom bg-green-dim/10" :
                  l.status === "UPCOMING" ? "border-amber-custom/30 text-amber-custom bg-amber-dim/10" :
                  l.status === "LISTED" ? "border-cyan-custom/30 text-cyan-custom bg-cyan-dim/10" :
                  "border-border-custom text-text-3 bg-bg-2"
                }`}>
                  {l.status}
                </span>
              </div>

              <div className="font-mono text-[0.62rem] text-text-2 flex flex-col gap-1">
                {l.priceBand && <span>Price band: <strong className="text-text-custom">{l.priceBand}</strong></span>}
                {l.lotSize && <span>Lot size: <strong className="text-text-custom">{l.lotSize} Shares</strong></span>}
                {l.issueSize && <span>Issue size: <strong className="text-text-custom">{l.issueSize}</strong></span>}
                {l.openDate && <span>Opens: <strong className="text-text-custom">{l.openDate}</strong></span>}
                {l.closeDate && <span>Closes: <strong className="text-text-custom">{l.closeDate}</strong></span>}
              </div>

              {/* GMP Details */}
              {l.gmp !== undefined && l.gmp !== null && (
                <div className="mt-1 border-t border-border-custom pt-2 flex items-center justify-between font-mono text-[0.62rem]">
                  <span className="text-text-3 uppercase tracking-wider">Grey Market Premium (GMP)</span>
                  <span className={`font-bold ${l.gmp >= 0 ? "text-green-custom" : "text-red-custom"}`}>
                    ₹{l.gmp} ({l.gmpPct}% Est. Gain)
                  </span>
                </div>
              )}

              {/* Multi-Category Subscription Details */}
              {(l.qibSub || l.niiSub || l.retailSub || l.subscription) && (
                <div className="mt-1 border-t border-border-custom pt-2 flex flex-col gap-1.5 font-mono">
                  <span className="text-[0.58rem] text-text-3 uppercase tracking-wider">Subscription Status</span>
                  <div className="grid grid-cols-4 gap-1 text-[0.58rem] text-text-2 text-center">
                    {l.qibSub && (
                      <div className="bg-bg-2 p-1 border border-border-custom rounded-sm">
                        <span className="text-text-4 block text-[0.5rem] uppercase">QIB</span>
                        <span className="font-bold text-text-custom">{l.qibSub}x</span>
                      </div>
                    )}
                    {l.niiSub && (
                      <div className="bg-bg-2 p-1 border border-border-custom rounded-sm">
                        <span className="text-text-4 block text-[0.5rem] uppercase">NII</span>
                        <span className="font-bold text-text-custom">{l.niiSub}x</span>
                      </div>
                    )}
                    {l.retailSub && (
                      <div className="bg-bg-2 p-1 border border-border-custom rounded-sm">
                        <span className="text-text-4 block text-[0.5rem] uppercase">RETAIL</span>
                        <span className="font-bold text-text-custom">{l.retailSub}x</span>
                      </div>
                    )}
                    {l.subscription && (
                      <div className="bg-bg-2 p-1 border border-green-custom/30 text-green-custom rounded-sm">
                        <span className="text-text-4 block text-[0.5rem] uppercase">TOTAL</span>
                        <span className="font-bold">{l.subscription}x</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
