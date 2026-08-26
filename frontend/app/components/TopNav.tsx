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
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    setUsername(localStorage.getItem("sp_username"));
    const saved = localStorage.getItem("sp_theme") as "dark" | "light" | null;
    if (saved) {
      setTheme(saved);
      if (saved === "light") {
        document.documentElement.classList.add("light");
        document.body.classList.add("light");
      } else {
        document.documentElement.classList.remove("light");
        document.body.classList.remove("light");
      }
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("sp_theme", next);
    if (next === "light") {
      document.documentElement.classList.add("light");
      document.body.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
      document.body.classList.remove("light");
    }
  };

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
    <header className="flex items-center justify-between py-3.5 px-4 md:px-8 border-b border-border-custom bg-bg-1 relative z-30">
      <div className="absolute bottom-[-1px] left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-green-custom to-transparent opacity-50" />
      
      {/* Left side: Logo (hidden on desktop sidebar layout) */}
      <Link href="/" className="flex md:hidden items-center gap-2 no-underline z-50">
        <div className="w-6 h-6 relative flex items-center justify-center shrink-0">
          <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polyline points="2,22 7,14 11,18 16,8 20,12 26,4" stroke="#00e5a0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <circle cx="26" cy="4" r="2.5" fill="#00e5a0" />
          </svg>
        </div>
        <h1 className="font-display text-[1.25rem] md:text-[1.5rem] tracking-[0.1em] text-text-custom leading-none select-none">
          STOCK<span className="text-green-custom">PULSE</span>
        </h1>
      </Link>

      {/* Desktop Search Terminal Bar (Aligned Left) */}
      <div className="hidden md:flex items-center bg-bg-2 border border-border-custom rounded px-2.5 py-1.5 w-56 gap-2 hover:border-border-bright transition-all">
        <span className="opacity-55 text-[0.65rem]">🔍</span>
        <input 
          type="text" 
          placeholder="Search stocks, indices..." 
          className="bg-transparent border-none outline-none w-full text-text-custom placeholder:text-text-4/40 text-[0.82rem] uppercase tracking-wider font-mono"
          style={{ fontSize: '0.82rem' }}
        />
      </div>

      {/* Right side: Desktop Wallets + Notification + Profile Actions */}
      <div className="flex items-center gap-3 md:gap-4.5">
        {/* Wallets (Desktop Only - hidden on mobile/tablet) */}
        <div className="hidden lg:flex gap-5 border-l border-r border-border-custom px-5 mr-1">
          <div>
            <span className="font-mono text-[0.7rem] text-text-3 block tracking-[0.08em] mb-0.5">INR WALLET</span>
            <span className="font-mono text-[0.95rem] text-green-custom font-bold">
              ₹{wallet.inr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            <span className="font-mono text-[0.7rem] text-text-3 block tracking-[0.08em] mb-0.5">USD WALLET</span>
            <span className="font-mono text-[0.95rem] text-cyan-custom font-bold">
              ${wallet.usd.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Theme Switcher Toggle Button */}
        <button
          className="bg-transparent border border-border-custom hover:border-green-custom rounded p-1.5 md:p-2 text-text-2 hover:text-green-custom transition-all cursor-pointer flex items-center justify-center select-none"
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          <span className="font-mono text-[0.8rem] md:text-[0.95rem]">
            {theme === "dark" ? "☀️" : "🌙"}
          </span>
        </button>

        {/* Notifications (Always visible, clean, compact) */}
        <div className="relative">
          <button
            className="relative bg-transparent border border-border-custom hover:border-amber-custom rounded p-1.5 md:p-2 text-text-2 hover:text-amber-custom transition-all cursor-pointer"
            onClick={() => setNotifOpen((v) => !v)}
            title="Notifications"
          >
            <span className="font-mono text-[0.8rem] md:text-[0.95rem]">🔔</span>
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-custom text-bg text-[0.52rem] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
          
          {/* Notification Dropdown */}
          {notifOpen && (
            <div className="absolute right-0 mt-2 w-72 md:w-80 max-h-96 overflow-y-auto bg-bg-2 border border-border-bright rounded shadow-2xl z-50">
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

        {/* Profile Avatar Actions (Desktop Only) */}
        {username && (
          <div className="hidden sm:flex items-center gap-3 border-l border-border-custom pl-4">
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-purple-custom to-cyan-custom flex items-center justify-center font-bold text-bg text-[0.82rem] border border-border-bright shrink-0 select-none">
              {username.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex flex-col items-start font-mono text-[0.8rem] gap-[0.05rem]">
              <span className="text-text-custom font-bold uppercase leading-none">{username}</span>
              <button onClick={handleLogout} className="bg-transparent border-none p-0 cursor-pointer text-[0.68rem] text-red-custom hover:underline uppercase font-mono">
                [ LOGOUT ]
              </button>
            </div>
          </div>
        )}

        {/* Time (Desktop Only - hidden on mobile/tablet) */}
        <div className="hidden md:flex font-mono text-[0.82rem] text-text-3 tracking-[0.08em] flex-col items-end gap-[0.1rem]">
          <span className="text-text-2 text-[0.9rem]">{time || "-- : -- : --"}</span>
          <span>IST · INDIA</span>
        </div>

        {/* Premium Mobile Menu Button (Hamburger) */}
        <button
          className="md:hidden flex flex-col justify-center items-center w-8 h-8 rounded border border-border-custom bg-transparent relative z-50 cursor-pointer hover:border-green-custom transition-all"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle Menu"
        >
          <div className="relative w-4 h-3 flex flex-col justify-between">
            <span className={`block h-[2px] w-full bg-text-2 rounded-full transition-all duration-300 origin-center ${menuOpen ? "rotate-45 translate-y-[5px]" : ""}`} />
            <span className={`block h-[2px] w-full bg-text-2 rounded-full transition-all duration-300 ${menuOpen ? "w-0 opacity-0" : ""}`} />
            <span className={`block h-[2px] w-full bg-text-2 rounded-full transition-all duration-300 origin-center ${menuOpen ? "-rotate-45 -translate-y-[5px]" : ""}`} />
          </div>
        </button>
      </div>

      {/* Drawer Overlay for Mobile */}
      <div 
        className={`md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${menuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setMenuOpen(false)}
      />

      {/* Drawer Menu for Mobile */}
      <div className={`md:hidden fixed top-0 right-0 bottom-0 w-[280px] max-w-[85vw] bg-bg-2 border-l border-border-custom z-50 flex flex-col p-6 shadow-2xl transition-transform duration-300 ease-in-out transform ${menuOpen ? "translate-x-0" : "translate-x-full"}`}>
        {/* Drawer Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border-custom mb-4">
          <span className="font-display text-sm tracking-[0.15em] text-text-custom uppercase">Menu</span>
          <button 
            className="text-text-3 hover:text-green-custom font-mono text-[0.65rem] cursor-pointer border border-border-bright rounded px-2 py-0.5"
            onClick={() => setMenuOpen(false)}
          >
            CLOSE
          </button>
        </div>

        {/* Drawer Nav Links */}
        <nav className="flex-1 overflow-y-auto py-2 flex flex-col gap-2">
          {NAV_LINKS.map((l) => {
            const isActive = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-3 py-2 px-3 rounded font-mono text-[0.7rem] tracking-wider transition-all duration-150 border ${
                  isActive 
                    ? "bg-green-dim/10 border-green-custom/30 text-green-custom font-bold" 
                    : "border-transparent text-text-2 hover:bg-bg-3 hover:text-text-custom"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-green-custom shadow-[0_0_8px_#00e5a0]" : "bg-text-3/30"}`} />
                {l.label}
              </Link>
            );
          })}
        </nav>

        {/* Drawer Footer (Wallets + Profile + Logout) */}
        <div className="mt-auto pt-4 border-t border-border-custom flex flex-col gap-3.5">
          {/* Wallets */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-bg-3/50 p-2.5 rounded border border-border-custom">
              <span className="font-mono text-[0.5rem] text-text-3 block tracking-[0.1em] mb-1">INR WALLET</span>
              <span className="font-mono text-[0.75rem] text-green-custom font-bold">
                ₹{wallet.inr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="bg-bg-3/50 p-2.5 rounded border border-border-custom">
              <span className="font-mono text-[0.5rem] text-text-3 block tracking-[0.1em] mb-1">USD WALLET</span>
              <span className="font-mono text-[0.75rem] text-cyan-custom font-bold">
                ${wallet.usd.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
          
          {/* Profile & Logout (Mobile View) */}
          {username && (
            <div className="flex items-center justify-between font-mono text-[0.7rem] bg-bg-3/40 p-2.5 rounded border border-border-custom">
              <div className="flex flex-col">
                <span className="text-text-3 text-[0.55rem] tracking-wider uppercase">Logged In As</span>
                <span className="text-text-custom font-bold">{username}</span>
              </div>
              <button onClick={handleLogout} className="bg-transparent border border-red-custom/30 rounded p-[0.2rem_0.5rem] cursor-pointer font-mono text-[0.58rem] text-red-custom hover:bg-red-custom/10 uppercase transition-all">
                LOGOUT
              </button>
            </div>
          )}

          {/* Time / Location */}
          <div className="flex justify-between items-center font-mono text-[0.62rem] text-text-3 bg-bg-3/20 p-2 rounded">
            <span>{time || "--:--:--"}</span>
            <span>IST · INDIA</span>
          </div>
        </div>
      </div>
    </header>
  );
}
