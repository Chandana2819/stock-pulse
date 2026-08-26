"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import TopNav from "./TopNav";

// Custom SVG Icons for Sidebar
const homeIcon = (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const chartIcon = (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
  </svg>
);

const portfolioIcon = (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
);

const signalsIcon = (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

const screenerIcon = (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 8.293A1 1 0 013 7.586V4z" />
  </svg>
);

const ipoIcon = (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
  </svg>
);

const fundsIcon = (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 14v6m-3-3h6M6 10h2m4 0h2m-6 4h6m2-10a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-3z" />
  </svg>
);

const goalsIcon = (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const eventsIcon = (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const communityIcon = (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1 1 0 01-1-1v-1M4 8h8a1 1 0 011 1v6a1 1 0 01-1 1H8l-4 4V9a1 1 0 011-1z" />
  </svg>
);

const alertsIcon = (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

const calcIcon = (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
  </svg>
);

const assistantIcon = (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
);

const learnIcon = (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

const journalIcon = (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const kycIcon = (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 014 0m-3 8a3 3 0 100-6 3 3 0 000 6z" />
  </svg>
);

const SIDEBAR_LINKS_1 = [
  { href: "/", label: "Dashboard", icon: homeIcon },
  { href: "/#market-overview", label: "Market Overview", icon: chartIcon },
  { href: "/portfolio", label: "Portfolio", icon: portfolioIcon },
  { href: "/stock-signals", label: "Stock Signals", icon: signalsIcon },
  { href: "/screener", label: "Screener", icon: screenerIcon },
  { href: "/ipo", label: "IPO", icon: ipoIcon },
  { href: "/mutual-funds", label: "Mutual Funds", icon: fundsIcon },
];

const SIDEBAR_LINKS_2 = [
  { href: "/goals", label: "Goals", icon: goalsIcon },
  { href: "/events", label: "Events", icon: eventsIcon },
  { href: "/community", label: "Community", icon: communityIcon },
  { href: "/alerts", label: "Alerts", icon: alertsIcon },
  { href: "/calculators", label: "Calculator", icon: calcIcon },
  { href: "/assistant", label: "AI Assistant", icon: assistantIcon },
  { href: "/learn", label: "Learn", icon: learnIcon },
  { href: "/journal", label: "Journal", icon: journalIcon },
  { href: "/kyc", label: "KYC", icon: kycIcon },
];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [currentHash, setCurrentHash] = useState("");

  useEffect(() => {
    const updateHash = () => {
      setCurrentHash(window.location.hash);
    };
    updateHash();
    window.addEventListener("hashchange", updateHash);
    
    const handleDocClick = () => {
      setTimeout(updateHash, 50);
    };
    document.addEventListener("click", handleDocClick);

    return () => {
      window.removeEventListener("hashchange", updateHash);
      document.removeEventListener("click", handleDocClick);
    };
  }, [pathname]);

  useEffect(() => {
    const username = localStorage.getItem("sp_username");
    if (!username && pathname !== "/login") {
      setAuthorized(false);
      router.push("/login");
    } else {
      setAuthorized(true);
    }
  }, [pathname, router]);

  useEffect(() => {
    const saved = localStorage.getItem("sp_theme");
    if (saved === "light") {
      document.documentElement.classList.add("light");
      document.body.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
      document.body.classList.remove("light");
    }
  }, []);

  useEffect(() => {
    const checkStatus = () => {
      const now = new Date();
      const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const day = ist.getDay(); 
      const hours = ist.getHours();
      const minutes = ist.getMinutes();
      const timeVal = hours * 60 + minutes;
      
      // Open between 9:30 AM (570) and 3:30 PM (930) on weekdays (1-5)
      if (day >= 1 && day <= 5 && timeVal >= 570 && timeVal <= 930) {
        setMarketOpen(true);
      } else {
        setMarketOpen(false);
      }
    };
    checkStatus();
    const id = setInterval(checkStatus, 60000);
    return () => clearInterval(id);
  }, []);

  if (!authorized && pathname !== "/login") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg font-mono text-xs text-text-3">
        REDIRECTING TO SESSION LOGIN...
      </div>
    );
  }

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-text-custom">
      {/* Desktop Sidebar Navigation */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border-custom bg-bg-1 shrink-0 h-full overflow-hidden">
        {/* Logo Section */}
        <div className="flex items-center gap-3 py-5 px-6 border-b border-border-custom justify-between shrink-0">
          <Link href="/" className="flex items-center gap-3 no-underline">
            <div className="w-6 h-6 relative flex items-center justify-center shrink-0">
              <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <polyline points="2,22 7,14 11,18 16,8 20,12 26,4" stroke="#00e5a0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <circle cx="26" cy="4" r="2.5" fill="#00e5a0" />
              </svg>
            </div>
            <h1 className="font-display text-[1.25rem] tracking-[0.1em] text-text-custom leading-none select-none">
              STOCK<span className="text-green-custom">PULSE</span>
            </h1>
          </Link>
          <div className="w-5 h-5 flex flex-col justify-center gap-1 cursor-pointer opacity-70 hover:opacity-100">
            <span className="h-[1.5px] w-4 bg-text-2 rounded-full" />
            <span className="h-[1.5px] w-3 bg-text-2 rounded-full" />
            <span className="h-[1.5px] w-4 bg-text-2 rounded-full" />
          </div>
        </div>

        {/* Sidebar Scrollable Links */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
          {/* Main Links */}
          <div className="flex flex-col gap-1">
            {SIDEBAR_LINKS_1.map((l) => {
              const [linkPath, linkHash] = l.href.split("#");
              const isActive = pathname === linkPath && (linkHash ? currentHash === `#${linkHash}` : !currentHash);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`flex items-center gap-3.5 py-2 px-3 rounded font-mono text-[0.82rem] tracking-wider transition-all duration-150 border ${
                    isActive
                      ? "bg-green-dim/15 border-green-custom/30 text-green-custom font-bold"
                      : "border-transparent text-text-2 hover:bg-bg-3/50 hover:text-text-custom"
                  }`}
                >
                  {l.icon}
                  <span>{l.label}</span>
                </Link>
              );
            })}
          </div>

          {/* More Links */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[0.72rem] text-text-3 uppercase tracking-wider px-3 mb-1 block">More</span>
            {SIDEBAR_LINKS_2.map((l) => {
              const [linkPath, linkHash] = l.href.split("#");
              const isActive = pathname === linkPath && (linkHash ? currentHash === `#${linkHash}` : !currentHash);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`flex items-center gap-3.5 py-2 px-3 rounded font-mono text-[0.82rem] tracking-wider transition-all duration-150 border ${
                    isActive
                      ? "bg-green-dim/15 border-green-custom/30 text-green-custom font-bold"
                      : "border-transparent text-text-2 hover:bg-bg-3/50 hover:text-text-custom"
                  }`}
                >
                  {l.icon}
                  <span>{l.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Upgrade Card */}
          <div className="mt-auto bg-gradient-to-b from-bg-2 to-bg-3 p-4 rounded border border-border-custom flex flex-col gap-2.5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-16 h-16 bg-purple-custom/10 rounded-full blur-xl group-hover:bg-purple-custom/20 transition-all duration-500" />
            <div className="flex items-center gap-2">
              <span className="text-sm">⚡</span>
              <span className="font-mono text-[0.72rem] font-bold text-text-custom">Upgrade to Pro</span>
            </div>
            <p className="font-mono text-[0.7rem] text-text-3 leading-normal">Unlock advanced analytics, real-time alerts and more.</p>
            <button className="w-full bg-green-dim/10 hover:bg-green-custom text-green-custom hover:text-bg border border-green-custom/30 rounded py-1.5 font-mono text-[0.75rem] font-bold uppercase transition-all cursor-pointer">
              Upgrade Now
            </button>
          </div>
        </div>

        {/* Live Market Status */}
        <div className="p-4 border-t border-border-custom flex flex-col gap-0.5 shrink-0">
          <span className="font-mono text-[0.72rem] text-text-3 uppercase tracking-wider block">Market Status</span>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${marketOpen ? "bg-green-custom shadow-[0_0_8px_#00e5a0]" : "bg-red-custom shadow-[0_0_8px_#ff3b5c]"} animate-custom-pulse`} />
            <span className="font-mono text-[0.82rem] text-text-custom font-bold">
              Market is {marketOpen ? "Open" : "Closed"}
            </span>
          </div>
          <span className="font-mono text-[0.7rem] text-text-3">09:30 AM - 03:30 PM (IST)</span>
        </div>
      </aside>

      {/* Main Content Pane */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <TopNav />
        <div className="flex-grow overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
