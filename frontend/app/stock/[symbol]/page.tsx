"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import CandleChart from "../../components/CandleChart";
import DecisionPanel from "../../components/DecisionPanel";
import WhyMovingPanel from "../../components/WhyMovingPanel";
import FundamentalsPanel from "../../components/FundamentalsPanel";
import TradeModal from "../../components/TradeModal";
import NotificationSystem, { Toast, useBrowserNotifications } from "../../components/NotificationSystem";
import { api, ApiRequestError } from "../../lib/api";

type Analysis = {
  found: true;
  symbol: string;
  resolved: { providerSymbol: string; displaySymbol: string; exchange: string };
  quote: {
    price: number;
    prevClose: number | null;
    open: number | null;
    dayHigh: number | null;
    dayLow: number | null;
    week52High: number | null;
    week52Low: number | null;
    volume: number | null;
    marketState?: string;
    quoteTime?: number;
  };
  candles: { time: number; open: number; high: number; low: number; close: number }[];
  indicators: any;
  fundamentals: any;
  sector: { key: string; name: string } | null;
  news: { title: string; link: string; pubDate: string; source: string; sentiment: string; importance: string }[];
  attribution: any;
  decision: any;
  priceChangePct: number | null;
};

export default function StockDetailPage() {
  const params = useParams();
  const router = useRouter();
  const symbol = decodeURIComponent(String(params.symbol ?? ""));

  const [data, setData] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isWatched, setIsWatched] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [tradeType, setTradeType] = useState<"BUY" | "SELL">("BUY");
  const [ownedQty, setOwnedQty] = useState(0);
  const [holding, setHolding] = useState<{ stock: string; quantity: number; avgPrice: number; currency: "INR" | "USD" } | undefined>(undefined);
  const [wallet, setWallet] = useState<{ walletInr: number; walletUsd: number }>({ walletInr: 0, walletUsd: 0 });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const { sendBrowserNotification } = useBrowserNotifications();

  const addToast = useCallback((toast: Omit<Toast, "id" | "timestamp">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-3), { ...toast, id, timestamp: Date.now() }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const analysis = await api.get<Analysis>(`/api/stocks/${encodeURIComponent(symbol)}`);
      setData(analysis);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Failed to load stock data");
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.get<string[]>("/api/watchlist");
        if (data) setIsWatched(list.includes(data.symbol));
      } catch {}
      try {
        const portfolio = await api.get<{ holdings: { stock: string; quantity: number; avgPrice: number; currency: "INR" | "USD" }[]; user: { walletInr: number; walletUsd: number } }>("/api/portfolio");
        setWallet(portfolio.user);
        if (data) {
          const h = portfolio.holdings.find((x) => x.stock === data.symbol);
          setOwnedQty(h?.quantity ?? 0);
          setHolding(h);
        }
      } catch {}
    })();
  }, [data]);

  const toggleWatchlist = async () => {
    if (!data) return;
    try {
      if (isWatched) {
        await api.del(`/api/watchlist?symbol=${data.symbol}`);
        setIsWatched(false);
        addToast({ type: "info", title: data.resolved.displaySymbol, message: "Removed from watchlist." });
      } else {
        await api.post("/api/watchlist", { symbol: data.symbol });
        setIsWatched(true);
        addToast({ type: "success", title: data.resolved.displaySymbol, message: "Added to watchlist." });
      }
    } catch {
      addToast({ type: "danger", title: "Error", message: "Failed to update watchlist." });
    }
  };

  const handleExecuteTrade = async (type: "BUY" | "SELL", qty: number, price: number) => {
    if (!data) return;
    try {
      await api.post("/api/transactions", { stock: data.symbol, type, quantity: qty, price });
      window.dispatchEvent(new CustomEvent("wallet-update"));
      addToast({ type: type === "BUY" ? "success" : "info", title: "ORDER EXECUTED", message: `${type === "BUY" ? "Bought" : "Sold"} ${qty} shares at ${price.toFixed(2)}` });
      sendBrowserNotification("Order Executed", `${type === "BUY" ? "Bought" : "Sold"} ${qty} shares of ${data.resolved.displaySymbol}`);
      load();
    } catch (e) {
      addToast({ type: "danger", title: "Order Failed", message: e instanceof ApiRequestError ? e.message : "Trade execution failed." });
    }
    setTradeOpen(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="flex items-end gap-[3px] h-8">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-1 bg-green-custom rounded-[1px] animate-bar-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
        <div className="font-mono text-[0.7rem] tracking-[0.15em] text-text-3 animate-pulse">LOADING {symbol}...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-[600px] mx-auto p-8 text-center">
        <div className="font-display text-2xl text-text-2 mb-2">STOCK NOT FOUND</div>
        <div className="font-mono text-xs text-text-3 mb-6">{error ?? `Couldn't resolve "${symbol}" on NSE, BSE, or global markets.`}</div>
        <button onClick={() => router.push("/")} className="font-mono text-xs bg-green-custom text-bg px-4 py-2 border-none cursor-pointer">
          ← BACK TO DASHBOARD
        </button>
      </div>
    );
  }

  const change = data.priceChangePct ?? 0;
  const isUp = change >= 0;
  const currency = data.resolved.exchange === "GLOBAL" ? "$" : "₹";

  return (
    <div className="max-w-[1100px] mx-auto w-full p-4 sm:p-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border border-border-bright bg-bg-1 p-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display text-3xl tracking-[0.1em] text-text-custom">{data.resolved.displaySymbol}</h1>
            <span className="font-mono text-[0.6rem] tracking-[0.1em] text-text-3 px-2 py-0.5 border border-border-custom">{data.resolved.exchange}</span>
            {data.sector && <span className="font-mono text-[0.6rem] tracking-[0.1em] text-blue-custom px-2 py-0.5 border border-blue-custom bg-blue-dim">{data.sector.name}</span>}
          </div>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-2xl font-bold text-text-custom">{currency}{data.quote.price.toFixed(2)}</span>
            <span className={`font-mono text-sm font-bold ${isUp ? "text-green-custom" : "text-red-custom"}`}>
              {isUp ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
            </span>
          </div>
          <div className="font-mono text-[0.62rem] text-text-3 flex gap-x-4 gap-y-1.5 flex-wrap">
            <span>Open: {currency}{data.quote.open?.toFixed(2) ?? "—"}</span>
            <span>High: {currency}{data.quote.dayHigh?.toFixed(2) ?? "—"}</span>
            <span>Low: {currency}{data.quote.dayLow?.toFixed(2) ?? "—"}</span>
            <span>Prev Close: {currency}{data.quote.prevClose?.toFixed(2) ?? "—"}</span>
            <span>Volume: {data.quote.volume?.toLocaleString() ?? "—"}</span>
            <span>52W High: {currency}{data.quote.week52High?.toFixed(2) ?? "—"}</span>
            <span>52W Low: {currency}{data.quote.week52Low?.toFixed(2) ?? "—"}</span>
          </div>
          <div className="font-mono text-[0.6rem] flex gap-3 flex-wrap mt-1">
            <span className={`px-2 py-0.5 border ${data.decision.dataFreshness === "LIVE" ? "text-green-custom border-green-custom bg-green-dim" : data.decision.dataFreshness === "DELAYED" ? "text-amber-custom border-amber-custom bg-amber-dim" : "text-red-custom border-red-custom bg-red-dim"}`}>
              {data.decision.dataFreshness === "DELAYED" ? "DATA DELAYED (15m)" : `DATA FRESHNESS: ${data.decision.dataFreshness}`}
            </span>
            <span className="text-text-3 px-2 py-0.5 border border-border-custom bg-bg-2">
              MARKET STATUS: {data.decision.marketStatus === "OPEN" ? "OPEN" : data.decision.marketStatus === "PRE_MARKET" ? "PRE-MARKET" : data.decision.marketStatus === "POST_MARKET" ? "POST-MARKET" : "CLOSED"}
            </span>
            <span className="text-text-4 py-0.5">
              Source: <span className="text-text-3">{data.decision.dataSource}</span>
            </span>
            <span className="text-text-4 py-0.5">
              Timestamp: <span className="text-text-3">{new Date(data.decision.dataTimestamp).toLocaleString()}</span>
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setTradeType("BUY"); setTradeOpen(true); }} className="font-mono text-xs font-bold px-4 py-2 border border-green-custom text-green-custom bg-green-dim hover:opacity-80">
            BUY
          </button>
          {ownedQty > 0 && (
            <button onClick={() => { setTradeType("SELL"); setTradeOpen(true); }} className="font-mono text-xs font-bold px-4 py-2 border border-red-custom text-red-custom bg-red-dim hover:opacity-80">
              SELL
            </button>
          )}
          <button
            onClick={toggleWatchlist}
            className={`font-mono text-xs px-4 py-2 border ${isWatched ? "border-amber-custom text-amber-custom bg-amber-dim" : "border-border-bright text-text-2"}`}
          >
            {isWatched ? "★ WATCHING" : "+ WATCH"}
          </button>
        </div>
      </div>

      <CandleChart candles={data.candles} stock={data.resolved.displaySymbol} />

      <DecisionPanel decision={data.decision} />

      {data.attribution && <WhyMovingPanel attribution={data.attribution} symbol={data.resolved.displaySymbol} />}

      <FundamentalsPanel fundamentals={data.fundamentals} indicators={data.indicators} />

      {/* News */}
      <div className="border border-border-bright bg-bg-1 overflow-hidden">
        <div className="py-[0.6rem] px-6 border-b border-border-custom bg-bg-2 flex items-center gap-2">
          <span className="w-[6px] h-[6px] rounded-full bg-red-custom animate-custom-pulse shrink-0" />
          <span className="font-mono text-[0.62rem] tracking-[0.18em] text-text-3 uppercase">LIVE NEWS · {data.resolved.displaySymbol}</span>
        </div>
        <div className="flex flex-col">
          {data.news.map((n, i) => (
            <a key={i} href={n.link} target="_blank" rel="noopener noreferrer" className="no-underline border-b border-border-custom last:border-b-0 hover:bg-bg-2 group">
              <div className="grid grid-cols-[2rem_1fr_auto] gap-3 items-center py-[0.65rem] px-5">
                <span className="font-mono text-[0.6rem] text-text-4">{String(i + 1).padStart(2, "0")}</span>
                <div className="flex flex-col gap-1 min-w-0">
                  <p className="text-xs text-text-2 leading-[1.45] group-hover:text-text-custom">{n.title}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {n.source && <span className="font-mono text-[0.58rem] text-blue-custom">{n.source}</span>}
                    <span className={`font-mono text-[0.55rem] px-1.5 py-[1px] border ${n.sentiment === "POSITIVE" ? "text-green-custom border-green-custom" : n.sentiment === "NEGATIVE" ? "text-red-custom border-red-custom" : "text-text-3 border-border-custom"}`}>
                      {n.sentiment}
                    </span>
                    {n.importance === "HIGH" && <span className="font-mono text-[0.55rem] px-1.5 py-[1px] border border-amber-custom text-amber-custom">HIGH IMPORTANCE</span>}
                  </div>
                </div>
                <span className="text-text-3 text-[0.7rem] group-hover:text-green-custom">↗</span>
              </div>
            </a>
          ))}
        </div>
      </div>

      <TradeModal
        isOpen={tradeOpen}
        type={tradeType}
        stockSymbol={data.symbol}
        displaySym={data.resolved.displaySymbol}
        price={data.quote.price}
        currency={data.resolved.exchange === "GLOBAL" ? "USD" : "INR"}
        walletBalance={data.resolved.exchange === "GLOBAL" ? wallet.walletUsd : wallet.walletInr}
        existingHolding={holding}
        onClose={() => setTradeOpen(false)}
        onExecute={handleExecuteTrade}
      />

      <NotificationSystem toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}
