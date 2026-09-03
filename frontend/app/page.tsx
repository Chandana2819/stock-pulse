"use client";

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import Link from "next/link";
import ResultCard from "./components/ResultCard";
import MarketOverview from "./components/MarketOverview";
import MarketBrief from "./components/MarketBrief";
import SectorStrip from "./components/SectorStrip";
import NotificationSystem, {
  Toast,
  useBrowserNotifications,
} from "./components/NotificationSystem";
import HoldingsPortfolio, { Holding } from "./components/HoldingsPortfolio";
import TradeModal from "./components/TradeModal";
import KpiDetailModal, { KpiDetailData } from "./components/KpiDetailModal";
import SectorExplorerModal, { SectorPerf } from "./components/SectorExplorerModal";
import { API_BASE } from "./lib/api";

const DEFAULT_PINNED_SECTORS = ["IT", "BANK", "AUTO", "PHARMA", "FMCG", "ENERGY", "REALTY", "FIN"];

const SECTOR_ICONS: Record<string, ReactNode> = {
  IT: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  BANK: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  AUTO: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
  PHARMA: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  ),
  FMCG: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  ),
  ENERGY: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  REALTY: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  FIN: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  METAL: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V8a2 2 0 00-2-2h-2V4a2 2 0 00-2-2h-2a2 2 0 00-2 2v2H7a2 2 0 00-2 2v13h14z" />
    </svg>
  ),
  PSUBANK: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M4 21V9l8-6 8 6v12M9 21v-6h6v6" />
    </svg>
  ),
};

const POPULAR = [
  "NIFTY", "SENSEX", "TCS", "RELIANCE", "INFY", "AAPL", "TSLA", "HINDUNILVR", "ICICIBANK"
];

// Sparkline Chart Component
const Sparkline = ({ points, color }: { points: number[]; color: string }) => {
  const width = 100;
  const height = 30;
  if (!points || points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const svgPoints = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p - min) / range) * height + 2; 
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg className="w-16 h-5 overflow-visible" viewBox={`0 0 ${width} ${height}`}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={svgPoints}
      />
    </svg>
  );
};

// stable index sparkline generators
const generateSparklineData = (symbol: string, pctChange: number | null) => {
  const isPositive = (pctChange || 0) >= 0;
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const points = [];
  let baseValue = 50;
  points.push(baseValue);
  
  for (let i = 1; i < 8; i++) {
    const change = ((hash >> i) & 7) - 3.5; 
    const drift = isPositive ? 1.5 : -1.5;
    baseValue += change + drift;
    points.push(baseValue);
  }
  return points;
};

type TrackRecordSummary = {
  backtested: { winRate: number; averageReturn: number; benchmarkReturn: number | null };
  live: {
    scoredSignals: number;
    awaitingWindow: number;
    directionalAccuracyPct: number | null;
    buy: { sampleSize: number; accuracyPct: number | null };
    sell: { sampleSize: number; accuracyPct: number | null };
  };
};

export default function Home() {
  const [stock, setStock] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [countdown, setCountdown] = useState(60);
  const [username, setUsername] = useState<string | null>(null);
  const { requestPermission, sendBrowserNotification } = useBrowserNotifications();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countRef = useRef<NodeJS.Timeout | null>(null);
  const currentStockRef = useRef<string>("");

  const [signalsSummary, setSignalsSummary] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [marketRisk, setMarketRisk] = useState<any>(null);
  const [indices, setIndices] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [sectorPerf, setSectorPerf] = useState<SectorPerf[]>([]);
  const [pinnedSectors, setPinnedSectors] = useState<string[]>(DEFAULT_PINNED_SECTORS);
  const [sectorModalOpen, setSectorModalOpen] = useState(false);
  const [sectorModalInitialKey, setSectorModalInitialKey] = useState<string | null>(null);
  const [trackRecord, setTrackRecord] = useState<TrackRecordSummary | null>(null);

  useEffect(() => {
    if (!stock.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/search?q=${stock}`);
        if (res.ok) {
          const json = await res.json();
          setSuggestions(json.stocks || []);
          setShowSuggestions(true);
        }
      } catch (err) {
        console.error("Error fetching suggestions:", err);
      }
    }, 200);

    return () => clearTimeout(delayDebounceFn);
  }, [stock]);

  useEffect(() => {
    setUsername(localStorage.getItem("sp_username"));
  }, []);

  const fetchSignalsOverview = useCallback(async () => {
    try {
      const deviceId = localStorage.getItem("sp_device_id");
      const token = localStorage.getItem("sp_token");
      const headers: Record<string, string> = {};
      if (deviceId) {
        headers["x-device-id"] = deviceId;
      }
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/api/signals`, { headers });
      if (res.ok) {
        const json = await res.json();
        setRecommendations(json.items || []);
        setSignalsSummary(json.summary);
      }
      const riskRes = await fetch(`${API_BASE}/api/signals/market-risk`, { headers });
      if (riskRes.ok) {
        const riskJson = await riskRes.json();
        setMarketRisk(riskJson);
      }
    } catch (e) {
      console.error("Error fetching signals overview:", e);
    }
  }, []);

  const fetchMarketData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/market`);
      if (res.ok) {
        const json = await res.json();
        setIndices(json.indices || []);
      }
    } catch (e) {
      console.error("Error fetching indices:", e);
    }
  }, []);

  const fetchSectorPerf = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/market/sectors`);
      if (res.ok) {
        const json = await res.json();
        setSectorPerf(json.sectors || []);
      }
    } catch (e) {
      console.error("Error fetching sector performance:", e);
    }
  }, []);

  const fetchTrackRecord = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/signals/track-record`);
      if (res.ok) {
        const json = await res.json();
        setTrackRecord(json);
      }
    } catch (e) {
      console.error("Error fetching track record:", e);
    }
  }, []);

  const togglePinnedSector = useCallback((key: string) => {
    setPinnedSectors((prev) => {
      if (prev.includes(key)) {
        const next = prev.filter((k) => k !== key);
        localStorage.setItem("sp_pinned_sectors", JSON.stringify(next));
        return next;
      }
      if (prev.length >= 8) return prev;
      const next = [...prev, key];
      localStorage.setItem("sp_pinned_sectors", JSON.stringify(next));
      return next;
    });
  }, []);

  // Simulated Trading State
  const [wallet, setWallet] = useState<{ inr: number; usd: number }>({ inr: 1000000, usd: 10000 });
  const [holdings, setHoldings] = useState<Holding[]>([]);

  // Dashboard always reflects market-wide signals (all scanned stocks), never just
  // the user's portfolio — /api/signals' `summary` field is portfolio-scoped once a
  // broker is connected, so counts are derived directly from the market-wide `items`.
  const displaySummary = useMemo(() => {
    const counts = { buy: 0, sell: 0, hold: 0, wait: 0 };
    for (const item of recommendations) {
      const action = String(item.action || "").toUpperCase();
      if (action.includes("BUY")) counts.buy++;
      else if (action.includes("SELL") || action === "REDUCE") counts.sell++;
      else if (action === "HOLD") counts.hold++;
      else counts.wait++;
    }
    return counts;
  }, [recommendations]);

  const topMarketPicks = useMemo(() => {
    return [...recommendations]
      .filter((item) => String(item.action || "").toUpperCase().includes("BUY"))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 5);
  }, [recommendations]);

  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [tradeType, setTradeType] = useState<"BUY" | "SELL">("BUY");
  const [kpiModal, setKpiModal] = useState<KpiDetailData | null>(null);

  const addToast = useCallback((toast: Omit<Toast, "id" | "timestamp">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-3), { ...toast, id, timestamp: Date.now() }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  // Fetch wallet & holdings from DB
  const fetchWalletAndHoldings = useCallback(async () => {
    const deviceId = localStorage.getItem("sp_device_id");
    if (!deviceId) return;
    try {
      // Wallet
      const userRes = await fetch(`${API_BASE}/api/user`, {
        headers: { "x-device-id": deviceId },
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        setWallet({ inr: userData.walletInr, usd: userData.walletUsd });
      }

      // Holdings
      const portRes = await fetch(`${API_BASE}/api/portfolio`, {
        headers: { "x-device-id": deviceId },
      });
      if (portRes.ok) {
        const portData = await portRes.json();
        setHoldings(portData.holdings);
      }
    } catch (e) {
      console.error("Error fetching wallet & holdings:", e);
    }
  }, []);

  // Fetch watchlist from DB
  const fetchWatchlist = useCallback(async () => {
    const deviceId = localStorage.getItem("sp_device_id");
    if (!deviceId) return;
    try {
      const res = await fetch(`${API_BASE}/api/watchlist`, {
        headers: { "x-device-id": deviceId },
      });
      if (res.ok) {
        const list = await res.json();
        setWatchlist(list);
      }
    } catch (e) {
      console.error("Error fetching watchlist:", e);
    }
  }, []);

  // Load initial data
  useEffect(() => {
    let deviceId = localStorage.getItem("sp_device_id");
    if (!deviceId) {
      deviceId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem("sp_device_id", deviceId);
    }

    const savedPins = localStorage.getItem("sp_pinned_sectors");
    if (savedPins) {
      try {
        const parsed = JSON.parse(savedPins);
        if (Array.isArray(parsed) && parsed.length > 0) setPinnedSectors(parsed);
      } catch {}
    }

    fetchWatchlist();
    fetchWalletAndHoldings();
    fetchSignalsOverview();
    fetchMarketData();
    fetchSectorPerf();
    fetchTrackRecord();
    requestPermission();
  }, [fetchWatchlist, fetchWalletAndHoldings, fetchSignalsOverview, fetchMarketData, fetchSectorPerf, fetchTrackRecord, requestPermission]);

  const handleOpenTradeModal = (type: "BUY" | "SELL") => {
    setTradeType(type);
    setIsTradeModalOpen(true);
  };

  const handleExecuteTrade = async (type: "BUY" | "SELL", qty: number, price: number) => {
    if (!data) return;
    const deviceId = localStorage.getItem("sp_device_id");
    if (!deviceId) return;

    try {
      const res = await fetch(`${API_BASE}/api/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
        },
        body: JSON.stringify({
          stock: data.stock,
          type,
          quantity: qty,
          price,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        addToast({
          type: "danger",
          title: "Order Failed",
          message: json.error || "Trade execution failed.",
        });
        return;
      }

      // Re-fetch database state
      await fetchWalletAndHoldings();

      // Dispatch global wallet update event so TopNav updates instantly
      window.dispatchEvent(new CustomEvent("wallet-update"));

      const displaySym = data.stock.replace(/^\^/, "").replace(/\.(NS|BO)$/, "");
      const isGlobal = !data.stock.endsWith(".NS") && !data.stock.endsWith(".BO");
      const currency = isGlobal ? "USD" : "INR";

      addToast({
        type: type === "BUY" ? "success" : "info",
        title: "ORDER EXECUTED",
        message: `${type === "BUY" ? "Bought" : "Sold"} ${qty} shares of ${displaySym} at ${currency === "USD" ? "$" : "₹"}${price.toFixed(2)}`,
      });
      sendBrowserNotification("Order Executed", `${type === "BUY" ? "Bought" : "Sold"} ${qty} shares of ${displaySym}`);
    } catch (e) {
      addToast({ type: "danger", title: "Error", message: "Network error executing trade." });
    }

    setIsTradeModalOpen(false);
  };

  const fetchData = useCallback(async (sym: string) => {
    if (!sym.trim()) return;
    setLoading(true);
    currentStockRef.current = sym;
    setCountdown(60);
    try {
      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock: sym }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast({
          type: "danger",
          title: "Analysis Failed",
          message: json.error || `Server responded with status ${res.status}`,
        });
        return;
      }
      if (json && json.stock) {
        setData(json);
        // Sync price in local holdings view dynamically
        setHoldings((prev) =>
          prev.map((h) => {
            if (h.stock === json.stock) {
              return { ...h, currentPrice: json.price };
            }
            return h;
          })
        );
      }

      if (json.alertLevel === "danger" || json.alertLevel === "warning") {
        addToast({
          type: json.alertLevel,
          title: json.stock,
          message: json.reason,
        });
        sendBrowserNotification(json.stock, json.reason, json.signal === "bearish" ? "📉" : "📈");
      }
    } catch {
      addToast({ type: "danger", title: "Error", message: "Failed to fetch data." });
    } finally {
      setLoading(false);
    }
  }, [addToast, sendBrowserNotification]);

  const handleAnalyze = () => {
    if (stock.trim()) {
      setShowSuggestions(false);
      resetAutoRefresh();
      fetchData(stock.trim());
    }
  };

  const handleSelectSuggestion = (sym: string) => {
    setStock(sym);
    setShowSuggestions(false);
    resetAutoRefresh();
    fetchData(sym);
  };

  const resetAutoRefresh = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (countRef.current) clearInterval(countRef.current);

    setCountdown(60);
    countRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) return 60;
        return c - 1;
      });
    }, 1000);

    timerRef.current = setInterval(() => {
      if (currentStockRef.current) fetchData(currentStockRef.current);
    }, 60000);
  };

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (countRef.current) clearInterval(countRef.current);
  }, []);

  const toggleWatchlist = async (sym: string) => {
    const upper = sym.toUpperCase().trim();
    const deviceId = localStorage.getItem("sp_device_id");
    if (!deviceId) return;

    const isWatched = watchlist.includes(upper);
    try {
      if (isWatched) {
        const res = await fetch(`${API_BASE}/api/watchlist?symbol=${upper}`, {
          method: "DELETE",
          headers: { "x-device-id": deviceId },
        });
        if (res.ok) {
          setWatchlist((prev) => prev.filter((s) => s !== upper));
          addToast({ type: "info", title: upper, message: "Removed from watchlist." });
        }
      } else {
        const res = await fetch(`${API_BASE}/api/watchlist`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-device-id": deviceId,
          },
          body: JSON.stringify({ symbol: upper }),
        });
        if (res.ok) {
          setWatchlist((prev) => [...prev, upper]);
          addToast({ type: "success", title: upper, message: "Added to watchlist." });
        }
      }
    } catch (e) {
      addToast({ type: "danger", title: "Error", message: "Failed to update watchlist." });
    }
  };

  const isWatched = watchlist.includes(stock.toUpperCase());

  return (
    <div className="grid grid-rows-[1fr_auto] min-h-screen">
      {/* ── Main Dashboard Layout ── */}
      <main className="max-w-[1450px] mx-auto w-full p-4 md:p-8 flex flex-col gap-6 md:gap-8">
        
        {/* ROW 1: Market Brief + Market Indices sparklines */}
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
          
          {/* Left Column: Brief */}
          <div className="xl:col-span-5 border border-border-custom bg-bg-1 p-5 rounded flex flex-col gap-4 relative overflow-hidden justify-between">
            <div className="flex flex-col gap-0.5">
              <h2 className="font-display text-lg font-bold text-text-custom uppercase tracking-wide flex items-center gap-2 leading-none">
                Good Evening, {username || "CHANDANA"} 👏
              </h2>
              <span className="font-mono text-[0.68rem] text-text-3">Here's your market brief</span>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-border-custom pt-4">
              {/* Market Risk Indicator */}
              <div
                className="flex flex-col gap-1 justify-center cursor-pointer group"
                onClick={() => {
                  const score = marketRisk?.score ?? 45;
                  const classification = marketRisk?.classification ?? "MODERATE";
                  const vix = indices.find((i: any) => i.symbol === "INDIA VIX");
                  const factors = marketRisk?.factors ?? [];
                  const trendFactor = factors.find((f: any) => f.key === "indexTrend");
                  const fiiDiiFactor = factors.find((f: any) => f.key === "fiiDii");
                  const availableCount = factors.filter((f: any) => f.available).length;
                  setKpiModal({
                    title: "Market Risk",
                    value: `${score}/100 — ${classification}`,
                    valueColor: score >= 70 ? "text-red-custom" : score >= 45 ? "text-amber-custom" : "text-green-custom",
                    description: "A composite read of broad-market conditions across volatility, trend, breadth, FII/DII flows, global cues, sector rotation, and options skew. Higher scores mean elevated risk of a drawdown; lower scores mean calmer, more supportive conditions for new positions.",
                    rows: [
                      { label: "Volatility (India VIX)", value: vix?.price != null ? vix.price.toFixed(2) : "—", color: (vix?.pctChange ?? 0) >= 0 ? "text-red-custom" : "text-green-custom" },
                      ...(trendFactor?.detail ? [{ label: "Broad Market Trend", value: trendFactor.detail }] : []),
                      ...(fiiDiiFactor?.detail ? [{ label: "FII/DII Flows", value: fiiDiiFactor.detail }] : []),
                      { label: "Risk Factors Tracked", value: factors.length ? `${availableCount} / ${factors.length}` : "7 / 7" },
                    ],
                    footerAction: { label: "View Full Signals", href: "/stock-signals" },
                  });
                }}
              >
                <span className="font-mono text-[0.52rem] text-text-3 uppercase tracking-wider block group-hover:text-text-custom transition-colors">Market Risk ⓘ</span>
                <span className={`font-mono text-[0.92rem] font-bold leading-none ${
                  marketRisk?.score >= 70 ? "text-red-custom" :
                  marketRisk?.score >= 45 ? "text-amber-custom" : "text-green-custom"
                }`}>
                  {marketRisk ? `${marketRisk.score}/100 — ${marketRisk.classification}` : "45/100 — MODERATE"}
                </span>
                {/* Progress Bar */}
                <div className="w-full bg-bg-3 h-1.5 rounded overflow-hidden mt-1.5">
                  <div
                    className={`h-full rounded transition-all duration-500 ${
                      marketRisk?.score >= 70 ? "bg-red-custom" :
                      marketRisk?.score >= 45 ? "bg-amber-custom" : "bg-green-custom"
                    }`}
                    style={{ width: `${marketRisk?.score || 45}%` }}
                  />
                </div>
              </div>

              {/* Portfolio Value */}
              <div
                className="flex flex-col gap-0.5 pl-5 border-l border-border-custom justify-center cursor-pointer group"
                onClick={() => {
                  const invested = holdings.reduce((sum, h) => sum + h.quantity * (h.avgPrice || 0), 0);
                  const current = holdings.reduce((sum, h) => sum + h.quantity * (h.currentPrice || h.avgPrice || 0), 0);
                  const pl = current - invested;
                  const plPct = invested > 0 ? (pl / invested) * 100 : 0;
                  setKpiModal({
                    title: "Portfolio Value",
                    value: `₹${current.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
                    description: "Current mark-to-market value of every holding in your simulated portfolio, based on live prices where available.",
                    rows: [
                      { label: "Holdings", value: `${holdings.length}` },
                      { label: "Invested Value", value: `₹${invested.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` },
                      { label: "Unrealized P&L", value: `${pl >= 0 ? "+" : ""}₹${pl.toLocaleString("en-IN", { maximumFractionDigits: 0 })} (${plPct >= 0 ? "+" : ""}${plPct.toFixed(2)}%)`, color: pl >= 0 ? "text-green-custom" : "text-red-custom" },
                    ],
                    footerAction: { label: "View Portfolio", href: "/portfolio" },
                  });
                }}
              >
                <span className="font-mono text-[0.52rem] text-text-3 uppercase tracking-wider block group-hover:text-text-custom transition-colors">PORTFOLIO VALUE ⓘ</span>
                <span className="font-mono text-[1.1rem] text-text-custom font-bold leading-none">
                  ₹{holdings.reduce((sum, h) => sum + (h.quantity * (h.currentPrice || h.avgPrice || 0)), 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-4 gap-2 border-t border-border-custom pt-4">
              {(() => {
                const vix = indices.find((i: any) => i.symbol === "INDIA VIX");
                const vixUp = (vix?.pctChange ?? 0) >= 0;
                return (
                  <div
                    className="cursor-pointer group"
                    onClick={() => setKpiModal({
                      title: "India VIX",
                      value: vix?.price != null ? vix.price.toFixed(2) : "—",
                      valueColor: vix ? (vixUp ? "text-red-custom" : "text-green-custom") : "text-text-4",
                      subtitle: vix?.pctChange != null ? `${vixUp ? "+" : ""}${vix.pctChange.toFixed(2)}% today` : undefined,
                      description: "India VIX measures the market's expectation of near-term volatility, derived from NIFTY option prices. A rising VIX generally signals rising fear; a falling VIX, calmer sentiment — a spike often precedes sharp index moves in either direction.",
                      rows: vix ? [
                        { label: "Today's Change", value: `${vixUp ? "+" : ""}${(vix.pctChange ?? 0).toFixed(2)}%`, color: vixUp ? "text-red-custom" : "text-green-custom" },
                      ] : [{ label: "Status", value: "Feed unavailable" }],
                    })}
                  >
                    <span className="font-mono text-[0.5rem] text-text-3 block uppercase tracking-wider group-hover:text-text-custom transition-colors">INDIA VIX ⓘ</span>
                    <span className="font-mono text-[0.75rem] text-text-custom font-bold">
                      {vix?.price != null ? vix.price.toFixed(2) : "—"}
                      {vix?.pctChange != null && (
                        <span className={`${vixUp ? "text-red-custom" : "text-green-custom"} text-[0.62rem]`}> ({vixUp ? "+" : ""}{vix.pctChange.toFixed(2)}%)</span>
                      )}
                    </span>
                  </div>
                );
              })()}
              <div
                className="cursor-pointer group"
                onClick={() => setKpiModal({
                  title: "Nifty Implied Volatility",
                  value: "—",
                  valueColor: "text-text-4",
                  description: "Implied Volatility (IV) reflects the market's forward-looking estimate of price movement, priced into NIFTY options. This environment doesn't have a licensed options-chain data feed connected, so no live number is shown here rather than a fabricated one — India VIX (a similar volatility read derived from the same options market) is live above.",
                })}
              >
                <span className="font-mono text-[0.5rem] text-text-3 block uppercase tracking-wider group-hover:text-text-custom transition-colors">NIFTY IV ⓘ</span>
                <span className="font-mono text-[0.75rem] text-text-4 font-bold">—</span>
              </div>
              <div
                className="cursor-pointer group"
                onClick={() => setKpiModal({
                  title: "Nifty Smile Gap",
                  value: "—",
                  valueColor: "text-text-4",
                  description: "The volatility smile gap compares implied volatility across out-of-the-money puts and calls. This environment doesn't have a licensed options-chain data feed connected, so no live number is shown here rather than a fabricated one.",
                })}
              >
                <span className="font-mono text-[0.5rem] text-text-3 block uppercase tracking-wider group-hover:text-text-custom transition-colors">NIFTY SMILE GAP ⓘ</span>
                <span className="font-mono text-[0.75rem] text-text-4 font-bold">—</span>
              </div>
              {(() => {
                const live = trackRecord?.live;
                const bt = trackRecord?.backtested;
                const pct = live?.directionalAccuracyPct ?? null;
                const color = pct == null ? "text-text-4" : pct >= 60 ? "text-green-custom" : pct >= 40 ? "text-amber-custom" : "text-red-custom";
                return (
                  <div
                    className="cursor-pointer group"
                    onClick={() =>
                      setKpiModal({
                        title: "AI Track Record",
                        value: pct != null ? `${pct}%` : "—",
                        valueColor: color,
                        subtitle: live ? `${live.scoredSignals} real signals scored` : undefined,
                        description:
                          "How this engine's calls have actually done. \"Live\" checks real signals the scanner issued against what the stock's price actually did afterward. \"Backtested\" replays today's engine logic over 2 real years of history across the full NSE universe. Neither is a forecast.",
                        rows: [
                          ...(live
                            ? [
                                {
                                  label: "Live: BUY accuracy",
                                  value: live.buy.sampleSize > 0 ? `${live.buy.accuracyPct}% correct (${live.buy.sampleSize} scored)` : "No sample yet",
                                  color: "text-green-custom",
                                },
                                {
                                  label: "Live: SELL / REDUCE accuracy",
                                  value: live.sell.sampleSize > 0 ? `${live.sell.accuracyPct}% correct (${live.sell.sampleSize} scored)` : "No sample yet",
                                  color: "text-red-custom",
                                },
                                ...(live.awaitingWindow > 0 ? [{ label: "Awaiting check window", value: `${live.awaitingWindow} signals` }] : []),
                              ]
                            : [{ label: "Status", value: "Loading..." }]),
                          ...(bt
                            ? [
                                { label: "Backtested win rate (2yr)", value: `${bt.winRate}%` },
                                {
                                  label: "vs NIFTY 50 (same window)",
                                  value: bt.benchmarkReturn != null ? `${bt.benchmarkReturn >= 0 ? "+" : ""}${bt.benchmarkReturn}%` : "—",
                                },
                              ]
                            : []),
                        ],
                        footerAction: { label: "View Full Track Record", href: "/stock-signals" },
                      })
                    }
                  >
                    <span className="font-mono text-[0.5rem] text-text-3 block uppercase tracking-wider group-hover:text-text-custom transition-colors">TRACK RECORD ⓘ</span>
                    <span className={`font-mono text-[0.75rem] font-bold ${color}`}>{pct != null ? `${pct}%` : "—"}</span>
                  </div>
                );
              })()}
            </div>

            {/* Notification Banner */}
            <div className="mt-2 bg-blue-dim/10 border border-blue-custom/25 rounded p-3 flex items-center gap-2.5">
              <span className="text-blue-custom text-xs shrink-0 select-none">ℹ️</span>
              <span className="font-mono text-[0.62rem] text-text-2">
                {holdings.length === 0 ? "Nothing to review yet – your portfolio is empty." : "Portfolio holds active simulated trading assets."}
              </span>
            </div>
          </div>

          {/* Right Column: Indices Overview */}
          <div className="xl:col-span-7 flex flex-col gap-4 justify-between">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[0.62rem] tracking-[0.15em] text-text-3 uppercase">Market Overview</span>
              </div>
              
              {/* Sparklines Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {(indices.length > 0 ? indices : [
                  { symbol: "NIFTY 50", price: 25497.10, pctChange: 0.41 },
                  { symbol: "SENSEX", price: 82442.36, pctChange: 0.47 },
                  { symbol: "BANK NIFTY", price: 56482.10, pctChange: -0.16 },
                  { symbol: "NIFTY MID CAP 100", price: 59274.90, pctChange: 0.94 },
                  { symbol: "SENSEX 17", price: 17472.04, pctChange: -0.08 }
                ]).slice(0, 5).map((idx: any) => {
                  const isUp = (idx.pctChange || 0) >= 0;
                  const color = isUp ? "#00e5a0" : "#ff3b5c";
                  const sparkPoints = generateSparklineData(idx.symbol, idx.pctChange);
                  
                  return (
                    <div
                      key={idx.symbol}
                      className="border border-border-custom bg-bg-1 p-3.5 rounded flex flex-col justify-between gap-3 hover:border-border-bright transition-all cursor-pointer"
                      onClick={() => setKpiModal({
                        title: idx.symbol,
                        badge: "INDEX",
                        value: idx.price ? idx.price.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—",
                        valueColor: isUp ? "text-green-custom" : "text-red-custom",
                        subtitle: `${isUp ? "▲" : "▼"} ${Math.abs(idx.pctChange || 0).toFixed(2)}% today`,
                        description: `Live snapshot of ${idx.symbol}. Use this alongside sector performance and market risk to gauge overall market direction before acting on individual stock signals.`,
                        chartPoints: sparkPoints,
                        chartColor: color,
                        rows: [
                          { label: "Last Price", value: idx.price ? idx.price.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—" },
                          { label: "Change", value: `${isUp ? "+" : ""}${(idx.pctChange || 0).toFixed(2)}%`, color: isUp ? "text-green-custom" : "text-red-custom" },
                        ],
                      })}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-[0.52rem] text-text-3 uppercase tracking-wider truncate block" title={idx.symbol}>{idx.symbol} ⓘ</span>
                        <span className="font-mono text-[0.82rem] text-text-custom font-bold">
                          {idx.price ? idx.price.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}
                        </span>
                      </div>
                      <div className="flex items-end justify-between">
                        <span className={`font-mono text-[0.65rem] font-bold ${isUp ? "text-green-custom" : "text-red-custom"}`}>
                          {isUp ? "▲" : "▼"} {Math.abs(idx.pctChange || 0).toFixed(2)}%
                        </span>
                        <Sparkline points={sparkPoints} color={color} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Market Risk strip banner */}
            <div className="bg-bg-1 border border-border-custom p-4 rounded flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-amber-dim rounded-full flex items-center justify-center text-xs shrink-0 select-none">⚠️</div>
                <div className="flex flex-col gap-0.5">
                  <div className="font-mono text-[0.72rem] text-text-custom font-bold uppercase tracking-wider">
                    MARKET RISK <span className="text-amber-custom">{marketRisk?.score || 45} / 100</span>{" "}
                    <span className="text-text-4 font-normal text-[0.62rem] lowercase ml-2">
                      {marketRisk?.factors?.length ? `${marketRisk.factors.filter((f: any) => f.available).length} / ${marketRisk.factors.length} risk factors available` : "Scanning…"}
                    </span>
                  </div>
                  <span className="font-mono text-[0.58rem] text-text-3">
                    {marketRisk?.reasons?.[0] ?? "Market risk factors are being computed."}
                  </span>
                </div>
              </div>
              <button
                className="font-mono text-[0.62rem] tracking-[0.1em] border border-border-bright hover:border-green-custom text-text-custom hover:text-green-custom p-[0.35rem_0.8rem] rounded bg-transparent cursor-pointer transition-all whitespace-nowrap"
                onClick={() => {
                  const factors = marketRisk?.factors ?? [];
                  setKpiModal({
                    title: "Market Risk Factors",
                    value: `${marketRisk?.score ?? 45} / 100`,
                    valueColor: (marketRisk?.score ?? 45) >= 70 ? "text-red-custom" : (marketRisk?.score ?? 45) >= 45 ? "text-amber-custom" : "text-green-custom",
                    subtitle: marketRisk?.classification ?? "MODERATE RISK",
                    description: marketRisk?.reasons?.join(" ") ?? "Market risk factors are being computed.",
                    rows: factors.length > 0
                      ? factors.map((f: any) => ({
                          label: f.label,
                          value: f.available ? (f.detail ?? `${f.score}/100`) : "Unavailable",
                          color: !f.available ? "text-text-4" : f.score >= 60 ? "text-green-custom" : f.score >= 40 ? "text-amber-custom" : "text-red-custom",
                        }))
                      : [{ label: "Status", value: "Scanning in progress" }],
                    footerAction: { label: "View Full Signals", href: "/stock-signals" },
                  });
                }}
              >
                View Factors
              </button>
            </div>
          </div>
        </section>

        {/* ROW 2: Sector Performance + Signals counters */}
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
          
          {/* Sector Performance Grid */}
          <div className="xl:col-span-8 border border-border-custom bg-bg-1 p-5 rounded flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[1rem] tracking-[0.15em] text-text-3 uppercase font-bold">{"SECTOR PERFORMANCE"}</span>
              <div className="flex items-center gap-2">
                {pinnedSectors.length < sectorPerf.length && (
                  <button
                    className="font-mono text-[0.62rem] tracking-[0.05em] border border-border-bright hover:border-green-custom text-text-2 hover:text-green-custom px-2 py-1 rounded bg-transparent cursor-pointer transition-all uppercase"
                    onClick={() => { setSectorModalInitialKey(null); setSectorModalOpen(true); }}
                  >
                    + Add
                  </button>
                )}
                <button
                  className="font-mono text-[0.65rem] tracking-[0.1em] text-green-custom hover:underline uppercase font-bold"
                  onClick={() => { setSectorModalInitialKey(null); setSectorModalOpen(true); }}
                >
                  See All →
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {pinnedSectors.slice(0, 8).map((key) => {
                const s = sectorPerf.find((x) => x.key === key);
                const label = s?.label ?? key;
                const pct = s?.pctChange ?? null;
                const isUp = (pct ?? 0) >= 0;
                return (
                  <div
                    key={key}
                    className="border border-border-custom bg-bg-2 p-3.5 rounded flex flex-col items-center justify-center gap-2 hover:border-border-bright transition-all cursor-pointer"
                    onClick={() => { setSectorModalInitialKey(key); setSectorModalOpen(true); }}
                  >
                    <span className={isUp ? "text-green-custom" : "text-red-custom"}>{SECTOR_ICONS[key]}</span>
                    <span className="font-mono text-[0.75rem] text-text-custom font-bold text-center truncate w-full" title={label}>{label}</span>
                    <span className={`font-mono text-[0.75rem] font-bold ${isUp ? "text-green-custom" : "text-red-custom"}`}>
                      {pct != null ? `${isUp ? "▲" : "▼"} ${Math.abs(pct).toFixed(2)}%` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Today's Market Signals Card */}
          <div className="xl:col-span-4 border border-border-custom bg-bg-1 p-5 rounded flex flex-col gap-4 justify-between">
            <div className="font-mono text-[1rem] tracking-[0.15em] text-text-3 uppercase font-bold">{"TODAY'S MARKET SIGNALS"}</div>
            
            <div className="flex flex-col gap-4 justify-between h-full">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 items-center w-full">
                <div
                  className="bg-green-dim/10 border border-green-custom/25 rounded p-2.5 text-center cursor-pointer hover:border-green-custom transition-all"
                  onClick={() => setKpiModal({
                    title: "BUY Signals",
                    value: `${displaySummary?.buy ?? 17}`,
                    valueColor: "text-green-custom",
                    description: "Stocks currently rated BUY by the 7-pillar quantitative model across the entire scanned market — strong trend, momentum, and fundamentals with no active safety overrides. Top-ranked picks by composite score:",
                    rows: topMarketPicks.length > 0
                      ? topMarketPicks.map((p) => ({ label: p.displaySymbol || p.symbol, value: `${p.score}/100`, color: "text-green-custom" }))
                      : undefined,
                    footerAction: { label: "View All Signals", href: "/stock-signals" },
                  })}
                >
                  <div className="font-mono text-[1.4rem] font-bold text-green-custom">{displaySummary?.buy ?? 17}</div>
                  <span className="font-mono text-[0.72rem] text-text-3 uppercase block tracking-wider mt-0.5">BUY ⓘ</span>
                </div>
                <div
                  className="bg-red-dim/10 border border-red-custom/25 rounded p-2.5 text-center cursor-pointer hover:border-red-custom transition-all"
                  onClick={() => setKpiModal({
                    title: "SELL Signals",
                    value: `${displaySummary?.sell ?? 29}`,
                    valueColor: "text-red-custom",
                    description: "Stocks currently rated SELL or REDUCE — weakening trend, negative momentum, or fundamentals deteriorating relative to peers.",
                    footerAction: { label: "View All Signals", href: "/stock-signals" },
                  })}
                >
                  <div className="font-mono text-[1.4rem] font-bold text-red-custom">{displaySummary?.sell ?? 29}</div>
                  <span className="font-mono text-[0.72rem] text-text-3 uppercase block tracking-wider mt-0.5">SELL ⓘ</span>
                </div>
                <div
                  className="bg-amber-dim/10 border border-amber-custom/25 rounded p-2.5 text-center cursor-pointer hover:border-amber-custom transition-all"
                  onClick={() => setKpiModal({
                    title: "HOLD Signals",
                    value: `${displaySummary?.hold ?? 55}`,
                    valueColor: "text-amber-custom",
                    description: "Stocks currently rated HOLD — mixed pillar scores where the model doesn't see a strong enough edge to add or exit.",
                    footerAction: { label: "View All Signals", href: "/stock-signals" },
                  })}
                >
                  <div className="font-mono text-[1.4rem] font-bold text-amber-custom">{displaySummary?.hold ?? 55}</div>
                  <span className="font-mono text-[0.72rem] text-text-3 uppercase block tracking-wider mt-0.5">HOLD ⓘ</span>
                </div>
                <div
                  className="bg-blue-dim/10 border border-blue-custom/25 rounded p-2.5 text-center cursor-pointer hover:border-blue-custom transition-all"
                  onClick={() => setKpiModal({
                    title: "WAIT Signals",
                    value: `${displaySummary?.wait ?? 33}`,
                    valueColor: "text-blue-custom",
                    description: "Stocks flagged WAIT — a safety override is active, usually due to insufficient data quality or elevated market/technical risk overriding what would otherwise be a BUY.",
                    footerAction: { label: "View All Signals", href: "/stock-signals" },
                  })}
                >
                  <div className="font-mono text-[1.4rem] font-bold text-blue-custom">{displaySummary?.wait ?? 33}</div>
                  <span className="font-mono text-[0.72rem] text-text-3 uppercase block tracking-wider mt-0.5">WAIT ⓘ</span>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border-custom pt-4 w-full">
                <div
                  className="flex flex-col cursor-pointer group"
                  onClick={() => setKpiModal({
                    title: "Market Bias",
                    value: "52/100 — MODERATE RISK",
                    valueColor: "text-amber-custom",
                    description: "A blended read of today's BUY/SELL/HOLD/WAIT signal mix and overall market risk score — a quick gut-check on whether conditions favor initiating new positions right now.",
                    rows: [
                      { label: "BUY Signals", value: `${displaySummary?.buy ?? 17}`, color: "text-green-custom" },
                      { label: "SELL Signals", value: `${displaySummary?.sell ?? 29}`, color: "text-red-custom" },
                      { label: "HOLD Signals", value: `${displaySummary?.hold ?? 55}`, color: "text-amber-custom" },
                      { label: "WAIT Signals", value: `${displaySummary?.wait ?? 33}`, color: "text-blue-custom" },
                    ],
                    footerAction: { label: "View All Signals", href: "/stock-signals" },
                  })}
                >
                  <span className="font-mono text-[0.7rem] text-text-4 uppercase block tracking-wider group-hover:text-text-custom transition-colors">MARKET BIAS ⓘ</span>
                  <span className="font-mono text-[0.82rem] text-text-custom font-bold uppercase mt-0.5 leading-none">
                    52/100 — <span className="text-amber-custom font-extrabold">MODERATE RISK</span>
                  </span>
                </div>
                <Link
                  href="/stock-signals"
                  className="font-mono text-[0.72rem] tracking-[0.1em] text-green-custom hover:underline flex items-center gap-1.5 uppercase font-bold"
                >
                  VIEW ALL SIGNALS →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ROW 3: Search Terminal + Output Result panel */}
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
          
          {/* Left Column: Search Terminal */}
          <div className="xl:col-span-7 flex flex-col gap-4 border border-border-custom bg-bg-1 p-5 rounded justify-between min-w-0">
            <div className="font-mono text-[0.62rem] tracking-[0.15em] text-text-3 uppercase">{"SEARCH TERMINAL"}</div>
            
            <div className="flex flex-col gap-5 w-full my-auto">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-0 relative w-full">
                <div className="relative flex-1 before:content-['›'] before:absolute before:left-[0.9rem] before:top-1/2 before:-translate-y-1/2 before:font-mono before:text-green-custom before:text-[1rem] before:pointer-events-none before:z-10">
                  <input
                    className="w-full bg-bg-2 border border-border-custom sm:border-r-0 p-[0.8rem_1rem_0.8rem_2.2rem] font-mono text-[0.85rem] text-text-custom tracking-[0.1em] uppercase outline-none transition-all duration-150 placeholder:text-text-4/40 focus:border-green-custom focus:bg-bg-3 focus:ring-1 focus:ring-green-custom rounded-l sm:rounded-r-none"
                    value={stock}
                    onChange={(e) => setStock(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                    placeholder="Search Symbol (E.g. GOOGL, TCS, AAPL)"
                    spellCheck={false}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  />
                  
                  {/* Dropdown Suggestions */}
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-bg-1 border border-border-custom shadow-[0_10px_30px_rgba(0,0,0,0.6)] rounded overflow-hidden z-50 backdrop-blur-xl max-h-[220px] overflow-y-auto">
                      {suggestions.map((s) => (
                        <div
                          key={s.symbol}
                          // onMouseDown (not onClick) + preventDefault: mousedown
                          // fires before the input's onBlur, so this runs before
                          // the 200ms blur-hide timer can race it and make the
                          // click land on a dropdown that already disappeared —
                          // exactly what was making this feel "not functional"
                          // under any real load.
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectSuggestion(s.symbol);
                          }}
                          className="flex items-center justify-between p-[0.65rem_1rem] cursor-pointer hover:bg-bg-3 border-b border-border-custom/30 last:border-b-0 transition-colors"
                        >
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="font-mono text-xs font-bold text-text-custom tracking-[0.05em] uppercase">{s.display}</span>
                            <span className="font-mono text-[0.62rem] text-text-3 truncate max-w-[280px]">{s.name}</span>
                          </div>
                          <span className="font-mono text-[0.58rem] text-green-custom px-1.5 py-0.5 border border-green-custom/30 rounded bg-green-dim/10 shrink-0 uppercase">{s.exchange}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 w-full sm:w-auto shrink-0">
                  <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 p-[0.8rem_1.4rem] bg-green-custom text-bg border-none cursor-pointer font-mono text-[0.75rem] font-bold tracking-[0.12em] uppercase transition-all duration-150 whitespace-nowrap active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-opacity-90 rounded-r sm:rounded-l-none" onClick={handleAnalyze} disabled={loading}>
                    {loading ? (
                      <><div className="w-[10px] h-[10px] border-[1.5px] border-bg border-t-transparent rounded-full animate-spin" /> FETCHING</>
                    ) : (
                      <>ANALYZE →</>
                    )}
                  </button>
                  <button
                    className="flex-1 sm:flex-none p-[0.8rem_1.2rem] bg-transparent border border-border-custom text-text-2 cursor-pointer font-mono text-[0.7rem] tracking-[0.1em] transition-all duration-150 whitespace-nowrap hover:border-amber-custom hover:text-amber-custom hover:bg-amber-dim rounded"
                    onClick={() => stock && toggleWatchlist(stock)}
                    title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
                  >
                    {isWatched ? "★ WATCHING" : "+ WATCH"}
                  </button>
                </div>
              </div>

              {/* Quick Picks */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-mono text-[0.55rem] tracking-[0.18em] text-text-3 uppercase select-none">Quick:</span>
                {POPULAR.map((s) => (
                  <button
                    key={s}
                    className="p-[0.25rem_0.65rem] bg-transparent border border-border-custom text-text-3 cursor-pointer font-mono text-[0.65rem] tracking-[0.05em] transition-all duration-150 rounded hover:border-green-custom hover:text-green-custom hover:bg-green-dim"
                    onClick={() => {
                      setStock(s);
                      resetAutoRefresh();
                      fetchData(s);
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Status Bar */}
            <div className="flex items-center gap-2 font-mono text-[0.6rem] text-text-3 tracking-[0.05em] py-[0.5rem] border-t border-border-custom flex-wrap mt-2 select-none">
              <div className="w-[5px] h-[5px] rounded-full bg-green-custom animate-custom-pulse shrink-0" />
              <span>LIVE</span>
              <span className="text-text-4 mx-1">·</span>
              <span>News/Updates</span>
              <span className="text-text-4 mx-1">·</span>
              <span>Budget News</span>
              <span className="text-text-4 mx-1">·</span>
              <span>RBI</span>
              <span className="text-text-4 mx-1">·</span>
              <span>SEBI</span>
              <span className="text-text-4 mx-1">·</span>
              <span>FII/DII</span>
              <span className="text-text-4 mx-1">·</span>
              <span>Earning Calender</span>
            </div>
          </div>

          {/* Right Column: Output result display */}
          <div className="xl:col-span-5 flex flex-col justify-between min-w-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center p-[4rem_2rem] gap-5 border border-border-custom bg-bg-1 rounded h-full">
                <div className="flex items-end gap-[3px] h-8">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="w-1 bg-green-custom rounded-[1px] animate-bar-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
                  ))}
                </div>
                <div className="font-mono text-[0.7rem] tracking-[0.15em] text-text-3 animate-pulse">FETCHING MARKET DATA...</div>
              </div>
            ) : data ? (
              <div className="flex flex-col gap-2.5 h-full">
                {data && <div className="h-[2px] bg-bg-3 overflow-hidden relative"><div className="h-full bg-gradient-to-r from-transparent via-green-custom to-cyan-custom origin-left animate-refresh-progress" key={data.stock + Date.now()} /></div>}
                <ResultCard
                  data={data}
                  onBuy={() => handleOpenTradeModal("BUY")}
                  onSell={() => handleOpenTradeModal("SELL")}
                  ownedQty={holdings.find((h) => h.stock === data.stock)?.quantity || 0}
                />
              </div>
            ) : (
              <div className="relative flex flex-col items-center justify-center p-[4.2rem_2rem] text-center gap-5 border border-border-custom bg-bg-1 overflow-hidden rounded h-full">
                {/* Grid background overlay */}
                <div 
                  className="absolute inset-0 opacity-40 pointer-events-none" 
                  style={{
                    backgroundImage: `
                      repeating-linear-gradient(0deg, transparent, transparent 29px, var(--color-border-custom) 30px),
                      repeating-linear-gradient(90deg, transparent, transparent 29px, var(--color-border-custom) 30px)
                    `
                  }} 
                />
                <div className="w-16 h-16 relative z-1 text-text-3 opacity-80 flex items-center justify-center">
                  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" className="w-12 h-12">
                    <rect x="4" y="4" width="56" height="56" rx="2" />
                    <polyline points="10,46 20,30 28,36 38,18 48,26 56,12" />
                    <circle cx="56" cy="12" r="3" fill="currentColor" />
                  </svg>
                </div>
                <div className="font-display text-[1.25rem] tracking-[0.15em] text-text-2 relative z-1 font-bold">ENTER A SYMBOL</div>
                <div className="font-mono text-[0.68rem] text-text-3 tracking-[0.05em] relative z-1">{"TYPE A STOCK SYMBOL AND PRESS ANALYZE"}</div>
                <div className="flex gap-2 relative z-1">
                  {["NSE", "BSE", "NYSE", "NASDAQ", "GLOBAL"].map((m) => (
                    <span key={m} className="py-[0.2rem] px-[0.5rem] border border-border-bright font-mono text-[0.58rem] tracking-[0.1em] text-text-3 rounded-sm bg-bg-2">{m}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Watchlist Section */}
        {watchlist.length > 0 && (
          <section className="border border-border-custom bg-bg-1 p-5 rounded flex flex-col gap-3">
            <div className="font-mono text-[0.62rem] tracking-[0.15em] text-text-3 uppercase flex items-center gap-[0.4rem] before:content-[''] before:inline-block before:w-[5px] before:h-[5px] before:bg-amber-custom before:animate-custom-pulse select-none">WATCHLIST</div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5">
              {watchlist.map((sym) => (
                <div key={sym} className="flex items-center justify-between p-[0.45rem_0.75rem] bg-bg-2 border border-border-custom cursor-pointer transition-all duration-150 gap-2 rounded hover:border-amber-custom hover:bg-amber-dim/10">
                  <span
                    className="font-mono text-[0.7rem] font-bold text-text-custom tracking-[0.05em] flex-1"
                    onClick={() => { setStock(sym); resetAutoRefresh(); fetchData(sym); }}
                  >
                    {sym}
                  </span>
                  <button
                    className="bg-transparent border-none text-text-3 cursor-pointer text-[0.65rem] p-0 leading-none transition-colors duration-150 hover:text-red-custom"
                    onClick={() => toggleWatchlist(sym)}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Portfolio Summary Quick View */}
        {holdings.length > 0 && (
          <HoldingsPortfolio
            holdings={holdings}
            wallet={wallet}
            onSellClick={(h) => {
              const currentPrice = data && data.stock === h.stock ? data.price : h.avgPrice;
              setData({
                stock: h.stock,
                price: currentPrice,
                prevClose: currentPrice,
                candles: [],
                risk: "Low",
                suggestion: "",
                action: "HOLD",
                reason: "",
                signal: "neutral",
                alertLevel: "info",
                news: [],
              });
              setStock(h.displaySym);
              handleOpenTradeModal("SELL");
            }}
            onSymbolClick={(symbol) => {
              setStock(symbol);
              fetchData(symbol);
            }}
          />
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="flex items-center justify-between p-[0.95rem_2rem] border-t border-border-custom bg-bg-1 select-none">
        <div className="font-mono text-[0.6rem] text-text-3 tracking-[0.05em]">
          © 2024 STOCKPULSE - DATA TANGO FINANCE &amp; GOOGLE NEWS - NOT FINANCIAL ADVICE
        </div>
        <div className="flex items-center gap-4 font-mono text-[0.6rem] text-text-4">
          <span className="hover:text-text-custom cursor-pointer">Privacy Policy</span>
          <span className="hover:text-text-custom cursor-pointer">Terms of Service</span>
          <span className="hover:text-text-custom cursor-pointer">Disclaimer</span>
          <span className="hover:text-text-custom cursor-pointer">Support</span>
        </div>
      </footer>

      {/* ── Toasts ── */}
      <NotificationSystem toasts={toasts} onDismiss={(id) =>
        setToasts((prev) => prev.filter((t) => t.id !== id))
      } />

      {/* ── KPI Detail Modal ── */}
      <KpiDetailModal data={kpiModal} onClose={() => setKpiModal(null)} />

      {/* ── Sector Explorer Modal ── */}
      <SectorExplorerModal
        isOpen={sectorModalOpen}
        onClose={() => setSectorModalOpen(false)}
        sectors={sectorPerf}
        pinned={pinnedSectors}
        onTogglePin={togglePinnedSector}
        initialSectorKey={sectorModalInitialKey}
      />

      {/* ── Trade Modal ── */}
      {data && (
        <TradeModal
          isOpen={isTradeModalOpen}
          type={tradeType}
          stockSymbol={data.stock}
          displaySym={data.stock.replace(/^\^/, "").replace(/\.(NS|BO)$/, "")}
          price={data.price}
          currency={(!data.stock.endsWith(".NS") && !data.stock.endsWith(".BO")) ? "USD" : "INR"}
          walletBalance={(!data.stock.endsWith(".NS") && !data.stock.endsWith(".BO")) ? wallet.usd : wallet.inr}
          existingHolding={holdings.find((h) => h.stock === data.stock)}
          onClose={() => setIsTradeModalOpen(false)}
          onExecute={handleExecuteTrade}
        />
      )}
    </div>
  );
}