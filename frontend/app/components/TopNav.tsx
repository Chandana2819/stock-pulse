"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, getDeviceId, clearSession } from "../lib/api";

const NAV_LINKS = [
  { href: "/", label: "DASHBOARD" },
  { href: "/screener", label: "SCREENER" },
  { href: "/portfolio", label: "PORTFOLIO" },
  { href: "/goals", label: "GOALS" },
  { href: "/mutual-funds", label: "FUNDS" },
  { href: "/ipo", label: "IPO" },
  { href: "/events", label: "EVENTS" },
  { href: "/community", label: "COMMUNITY" },
  { href: "/alerts", label: "ALERTS" },
  { href: "/calculators", label: "CALC" },
  { href: "/assistant", label: "ASSISTANT" },
  { href: "/learn", label: "LEARN" },
  { href: "/journal", label: "JOURNAL" },
  { href: "/kyc", label: "KYC" },
];

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [wallet, setWallet] = useState<{ inr: number; usd: number }>({ inr: 1000000, usd: 10000 });
  const [time, setTime] = useState<string>("");
  const [username, setUsername] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifItems, setNotifItems] = useState<Array<{ id: string; title: string; body: string; category: string; readAt: string | null; createdAt: string }>>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setUsername(localStorage.getItem("sp_username"));
  }, []);

  const handleLogout = async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // proceed with local logout even if the network call fails
    }
    clearSession();
    window.location.href = "/login";
  };

  const fetchWallet = useCallback(async () => {
    getDeviceId();
    try {
      const data = await api.get<{ walletInr: number; walletUsd: number }>("/api/user");
      setWallet({ inr: data.walletInr, usd: data.walletUsd });
    } catch (e) {
      console.error("Failed to fetch wallet info:", e);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await api.get<{ items: typeof notifItems; unreadCount: number }>("/api/notifications?pageSize=8");
      setNotifItems(data.items);
      setUnread(data.unreadCount);
    } catch {
      // notifications are best-effort; silently ignore
    }
  }, []);

  useEffect(() => {
    fetchWallet();
    fetchNotifications();
    const handleUpdate = () => fetchWallet();
    window.addEventListener("wallet-update", handleUpdate);
    const poll = setInterval(fetchNotifications, 60000);
    return () => {
      window.removeEventListener("wallet-update", handleUpdate);
      clearInterval(poll);
    };
  }, [fetchWallet, fetchNotifications]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      setTime(ist.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).toUpperCase());
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const markAllRead = async () => {
    try {
      await api.post("/api/notifications/read-all");
      setUnread(0);
      setNotifItems((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    } catch {}
  };

  return (
    <header className="flex flex-col md:flex-row items-center justify-between py-3 px-4 sm:px-8 border-b border-border-custom bg-bg-1 relative gap-3 md:gap-0">
      <div className="absolute bottom-[-1px] left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-green-custom to-transparent opacity-50" />
      <div className="flex items-center gap-3 w-full md:w-auto justify-between">
        <Link href="/" className="flex items-center gap-3 no-underline">
          <div className="w-7 h-7 relative flex items-center justify-center shrink-0">
            <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <polyline points="2,22 7,14 11,18 16,8 20,12 26,4" stroke="#00e5a0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <circle cx="26" cy="4" r="2" fill="#00e5a0" />
            </svg>
          </div>
          <h1 className="font-display text-[1.6rem] tracking-[0.12em] text-text-custom leading-none">
            STOCK<span className="text-green-custom">PULSE</span>
          </h1>
        </Link>
        <button
          className="md:hidden font-mono text-[0.65rem] border border-border-bright px-2 py-1 text-text-2"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? "CLOSE" : "MENU"}
        </button>
      </div>

      {/* Navigation Menu */}
      <nav className={`flex-col md:flex-row gap-2 md:gap-4 md:ml-8 md:mr-auto justify-center md:justify-start w-full md:w-auto ${menuOpen ? "flex" : "hidden md:flex"}`}>
        {NAV_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={() => setMenuOpen(false)}
            className={`font-mono text-[0.72rem] no-underline tracking-[0.05em] pb-[2px] transition-colors duration-150 ${
              pathname === l.href ? "text-green-custom font-bold border-b border-green-custom" : "text-text-2 font-normal hover:text-text-custom"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      {/* Wallets */}
      <div className="hidden lg:flex gap-6 border-l border-r border-border-custom px-6">
        <div>
          <span className="font-mono text-[0.55rem] text-text-3 block tracking-[0.1em]">INR WALLET</span>
          <span className="font-mono text-[0.95rem] text-green-custom font-bold">
            ₹{wallet.inr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div>
          <span className="font-mono text-[0.55rem] text-text-3 block tracking-[0.1em]">USD WALLET</span>
          <span className="font-mono text-[0.95rem] text-cyan-custom font-bold">
            ${wallet.usd.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Notification bell */}
        <div className="relative">
          <button
            className="relative bg-transparent border border-border-custom rounded p-[0.4rem_0.55rem] text-text-2 hover:border-amber-custom hover:text-amber-custom transition-colors"
            onClick={() => setNotifOpen((v) => !v)}
            title="Notifications"
          >
            <span className="font-mono text-[0.7rem]">🔔</span>
            {unread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-custom text-bg text-[0.55rem] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-bg-2 border border-border-bright rounded shadow-2xl z-50">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border-custom">
                <span className="font-mono text-[0.6rem] tracking-[0.15em] text-text-3 uppercase">Notifications</span>
                <button className="font-mono text-[0.58rem] text-blue-custom hover:underline" onClick={markAllRead}>
                  Mark all read
                </button>
              </div>
              {notifItems.length === 0 ? (
                <div className="p-4 text-center font-mono text-[0.65rem] text-text-3">No notifications yet</div>
              ) : (
                notifItems.map((n) => (
                  <div key={n.id} className={`px-3 py-2 border-b border-border-custom last:border-b-0 ${!n.readAt ? "bg-bg-3" : ""}`}>
                    <div className="font-mono text-[0.55rem] text-text-3 uppercase tracking-wider">{n.category}</div>
                    <div className="text-xs font-bold text-text-custom">{n.title}</div>
                    <div className="text-[0.68rem] text-text-2 leading-snug">{n.body}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {username && (
          <div className="flex flex-col items-end border-l border-border-custom pl-4 font-mono text-[0.72rem] text-text-3 gap-[0.15rem]">
            <span className="text-text-2 text-[0.85rem] font-bold uppercase">{username}</span>
            <button onClick={handleLogout} className="bg-transparent border-none p-0 cursor-pointer font-mono text-[0.6rem] text-red-custom hover:underline uppercase">
              [ LOGOUT ]
            </button>
          </div>
        )}

        <div className="hidden md:flex font-mono text-[0.72rem] text-text-3 tracking-[0.08em] flex-col items-end gap-[0.15rem]">
          <span className="text-text-2 text-[0.85rem]">{time || "-- : -- : --"}</span>
          <span>IST · INDIA</span>
        </div>
      </div>
    </header>
  );
}
