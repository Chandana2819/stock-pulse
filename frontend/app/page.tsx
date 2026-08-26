"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
import { API_BASE } from "./lib/api";

const POPULAR = [
  "SUZLON", "TCS", "RELIANCE", "INFY",
  "AAPL", "TSLA", "NVDA", "HDFCBANK",
];

export default function Home() {
  const [stock, setStock] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [countdown, setCountdown] = useState(60);
  const { requestPermission, sendBrowserNotification } = useBrowserNotifications();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countRef = useRef<NodeJS.Timeout | null>(null);
  const currentStockRef = useRef<string>("");

  const [signalsSummary, setSignalsSummary] = useState<any>(null);
  const [marketRisk, setMarketRisk] = useState<any>(null);

  const fetchSignalsOverview = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/signals`);
      if (res.ok) {
        const json = await res.json();
        setSignalsSummary(json.summary);
      }
      const riskRes = await fetch(`${API_BASE}/api/signals/market-risk`);
      if (riskRes.ok) {
        const riskJson = await riskRes.json();
        setMarketRisk(riskJson);
      }
    } catch (e) {
      console.error("Error fetching signals overview:", e);
    }
  }, []);

  // Simulated Trading State
  const [wallet, setWallet] = useState<{ inr: number; usd: number }>({ inr: 1000000, usd: 10000 });
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [tradeType, setTradeType] = useState<"BUY" | "SELL">("BUY");

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

    fetchWatchlist();
    fetchWalletAndHoldings();
    fetchSignalsOverview();
    requestPermission();
  }, [fetchWatchlist, fetchWalletAndHoldings, fetchSignalsOverview, requestPermission]);

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
      resetAutoRefresh();
      fetchData(stock.trim());
    }
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
    <div className="grid grid-rows-[auto_1fr_auto] min-h-[calc(100vh-32px)] pt-4">
      {/* ── Main ── */}
      <main className="grid grid-cols-1 max-w-[1100px] mx-auto w-full p-4 sm:p-8 gap-4 sm:gap-8">
        <MarketBrief />
        <MarketOverview />
        <SectorStrip />

        {/* Today's Stock Signals Dashboard Card */}
        <section className="border border-border-bright bg-bg-1 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex flex-col gap-1.5">
            <div className="font-mono text-[0.62rem] tracking-[0.15em] text-text-3 uppercase">{"// TODAY'S MARKET SIGNALS"}</div>
            {signalsSummary ? (
              <div className="flex items-center gap-4 flex-wrap">
                <span className="font-mono text-xs text-text-2 flex items-center gap-1">🟢 <span className="font-bold text-green-custom">{signalsSummary.buy}</span> BUY</span>
                <span className="font-mono text-xs text-text-2 flex items-center gap-1">🔴 <span className="font-bold text-red-custom">{signalsSummary.sell}</span> SELL</span>
                <span className="font-mono text-xs text-text-2 flex items-center gap-1">🟡 <span className="font-bold text-blue-custom">{signalsSummary.hold}</span> HOLD</span>
                <span className="font-mono text-xs text-text-2 flex items-center gap-1">⚪ <span className="font-bold text-amber-custom">{signalsSummary.wait}</span> WAIT</span>
              </div>
            ) : (
              <span className="font-mono text-[0.65rem] text-text-4">Syncing market scanner signals...</span>
            )}
          </div>

          <div className="flex items-center gap-5 flex-wrap">
            {marketRisk && (
              <div className="flex flex-col text-right">
                <span className="font-mono text-[0.52rem] text-text-4 uppercase">Market Risk Radar</span>
                <span className={`font-mono text-xs font-bold ${
                  marketRisk.score >= 70 ? "text-red-custom" :
                  marketRisk.score >= 45 ? "text-amber-custom" : "text-green-custom"
                }`}>
                  {marketRisk.score}/100 — {marketRisk.classification}
                </span>
              </div>
            )}
            <Link
              href="/stock-signals"
              className="font-mono text-[0.65rem] tracking-[0.12em] bg-bg-3 border border-border-bright text-text-custom p-[0.6rem_1.2rem] hover:bg-bg-4 hover:border-green-custom hover:text-green-custom"
            >
              VIEW ALL SIGNALS →
            </Link>
          </div>
        </section>

        {/* ── Search ── */}
        <section className="flex flex-col gap-5">
          <div className="font-mono text-[0.62rem] tracking-[0.15em] text-text-3 uppercase">{"// SEARCH TERMINAL"}</div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-0 relative">
            <div className="relative flex-1 before:content-['›'] before:absolute before:left-[0.9rem] before:top-1/2 before:-translate-y-1/2 before:font-mono before:text-green-custom before:text-[1rem] before:pointer-events-none before:z-10">
              <input
                className="w-full bg-bg-2 border border-border-bright sm:border-r-0 p-[0.8rem_1rem_0.8rem_2.2rem] font-mono text-[0.9rem] text-text-custom tracking-[0.1em] uppercase outline-none transition-all duration-150 placeholder:text-text-4 placeholder:tracking-[0.05em] focus:border-green-custom focus:bg-bg-3 focus:ring-1 focus:ring-green-custom"
                value={stock}
                onChange={(e) => setStock(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                placeholder="SYMBOL  (e.g. SUZLON, TCS, AAPL)"
                spellCheck={false}
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 p-[0.8rem_1.4rem] bg-green-custom text-bg border-none cursor-pointer font-mono text-[0.75rem] font-bold tracking-[0.12em] uppercase transition-all duration-150 whitespace-nowrap relative overflow-hidden active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-opacity-90" onClick={handleAnalyze} disabled={loading}>
                {loading ? (
                  <><div className="w-[10px] h-[10px] border-[1.5px] border-bg border-t-transparent rounded-full animate-spin" /> FETCHING</>
                ) : (
                  <>ANALYZE →</>
                )}
              </button>
              <button
                className="flex-1 sm:flex-none p-[0.8rem_1rem] bg-transparent border border-border-bright text-text-2 cursor-pointer font-mono text-[0.7rem] tracking-[0.1em] transition-all duration-150 whitespace-nowrap hover:border-amber-custom hover:text-amber-custom hover:bg-amber-dim"
                onClick={() => stock && toggleWatchlist(stock)}
                title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
              >
                {isWatched ? "★ WATCHING" : "+ WATCH"}
              </button>
            </div>
          </div>

          {/* Quick Picks */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-[0.58rem] tracking-[0.18em] text-text-3 uppercase">QUICK</span>
            {POPULAR.map((s) => (
              <button
                key={s}
                className="p-[0.25rem_0.6rem] bg-transparent border border-border-custom text-text-3 cursor-pointer font-mono text-[0.65rem] tracking-[0.08em] transition-all duration-150 hover:border-green-custom hover:text-green-custom hover:bg-green-dim"
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

          {/* Status Bar */}
          <div className="flex items-center gap-2 font-mono text-[0.62rem] text-text-3 tracking-[0.05em] py-[0.4rem] border-t border-b border-border-custom flex-wrap">
            <div className="w-[5px] h-[5px] rounded-full bg-green-custom animate-custom-pulse shrink-0" />
            <span>LIVE</span>
            <span className="text-text-4 mx-1">·</span>
            <span>Yahoo Finance</span>
            <span className="text-text-4 mx-1">·</span>
            <span>Google News</span>
            <span className="text-text-4 mx-1">·</span>
            {data && (
              <>
                <span>Auto-refresh in {countdown}s</span>
                <span className="text-text-4 mx-1">·</span>
              </>
            )}
            <span>NSE · BSE · NYSE · NASDAQ · Global</span>
          </div>

          {/* Watchlist */}
          {watchlist.length > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-3">
                <div className="font-mono text-[0.62rem] tracking-[0.15em] text-text-3 uppercase flex items-center gap-[0.4rem] before:content-[''] before:inline-block before:w-[5px] before:h-[5px] before:bg-amber-custom before:animate-custom-pulse">WATCHLIST</div>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2">
                {watchlist.map((sym) => (
                  <div key={sym} className="flex items-center justify-between p-[0.4rem_0.65rem] bg-bg-2 border border-border-custom cursor-pointer transition-all duration-150 gap-2 rounded hover:border-amber-custom hover:bg-amber-dim">
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
            </div>
          )}
        </section>

        {/* ── Results ── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center p-[4rem_2rem] gap-5 border border-border-custom bg-bg-1 rounded">
            <div className="flex items-end gap-[3px] h-8">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="w-1 bg-green-custom rounded-[1px] animate-bar-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
            <div className="font-mono text-[0.7rem] tracking-[0.15em] text-text-3 animate-pulse">FETCHING MARKET DATA...</div>
          </div>
        ) : data ? (
          <>
            {data && <div className="h-[2px] bg-bg-3 overflow-hidden relative"><div className="h-full bg-gradient-to-r from-transparent via-green-custom to-cyan-custom origin-left animate-refresh-progress" key={data.stock + Date.now()} /></div>}
            <ResultCard
              data={data}
              onBuy={() => handleOpenTradeModal("BUY")}
              onSell={() => handleOpenTradeModal("SELL")}
              ownedQty={holdings.find((h) => h.stock === data.stock)?.quantity || 0}
            />
          </>
        ) : (
          <div className="relative flex flex-col items-center justify-center p-[4rem_2rem] text-center gap-6 border border-border-custom bg-bg-1 overflow-hidden rounded">
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
            <div className="w-16 h-16 relative z-1">
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
                <rect x="4" y="4" width="56" height="56" rx="2" />
                <polyline points="10,46 20,30 28,36 38,18 48,26 56,12" />
                <circle cx="56" cy="12" r="3" fill="currentColor" />
              </svg>
            </div>
            <div className="font-display text-[1.4rem] tracking-[0.15em] text-text-2 relative z-1">ENTER A SYMBOL</div>
            <div className="font-mono text-[0.7rem] text-text-3 tracking-[0.1em] relative z-1">{"// TYPE A STOCK SYMBOL AND PRESS ANALYZE"}</div>
            <div className="flex gap-2 relative z-1">
              {["NSE", "BSE", "NYSE", "NASDAQ", "GLOBAL"].map((m) => (
                <span key={m} className="py-[0.2rem] px-[0.5rem] border border-border-bright font-mono text-[0.6rem] tracking-[0.1em] text-text-3 rounded-sm">{m}</span>
              ))}
            </div>
          </div>
        )}

        {/* ── Portfolio Summary Quick View ── */}
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
      <footer className="flex items-center justify-between p-[0.75rem_2rem] border-t border-border-custom bg-bg-1">
        <div className="font-mono text-[0.62rem] text-text-3 tracking-[0.05em]">
          STOCKPULSE · DATA VIA YAHOO FINANCE &amp; GOOGLE NEWS · NOT FINANCIAL ADVICE
        </div>
        <div className="flex items-center gap-3 font-mono text-[0.6rem] text-text-4">
          <span>© 2026</span>
        </div>
      </footer>

      {/* ── Toasts ── */}
      <NotificationSystem toasts={toasts} onDismiss={(id) =>
        setToasts((prev) => prev.filter((t) => t.id !== id))
      } />

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