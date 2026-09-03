"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, ApiRequestError, apiFetch } from "../lib/api";

type SignalItem = {
  id: string;
  symbol: string;
  displaySymbol: string;
  name: string | null;
  sector: string;
  sectorKey: string;
  exchange: string;
  action: string;
  score: number;
  confidence: number;
  risk: string;
  reasons: string[];
  warnings: string[];
  entryZone: { min: number; max: number } | null;
  stopLoss: number | null;
  targetRange: { min: number; max: number } | null;
  dataQuality: number;
  generatedAt: string;
};

type SignalsSummary = {
  total: number;
  buy: number;
  sell: number;
  hold: number;
  wait: number;
};

type RiskFactor = {
  key: string;
  label: string;
  score: number | null;
  weight: number;
  available: boolean;
  detail: string;
};

type MarketRiskData = {
  score: number;
  classification: string;
  statusEmoji: string;
  factors: RiskFactor[];
  reasons: string[];
  createdAt?: string;
};

type BacktestTrade = {
  symbol: string;
  entryDate: string;
  entryPrice: number;
  exitDate: string | null;
  exitPrice: number | null;
  returnPct: number | null;
  durationDays: number | null;
};

type BacktestResult = {
  totalTrades: number;
  buySignalsCount: number;
  sellSignalsCount: number;
  winRate: number;
  averageReturn: number;
  maxDrawdown: number;
  averageHoldingPeriod: number;
  benchmarkReturn: number | null;
  trades: BacktestTrade[];
};

type DirectionalOutcome = { sampleSize: number; accuracyPct: number | null; avgReturnPct: number | null };

type TrackRecordData = {
  backtested: {
    totalTrades: number;
    winRate: number;
    averageReturn: number;
    maxDrawdown: number;
    averageHoldingPeriod: number;
    benchmarkReturn: number | null;
    symbolsCovered: number;
    windowLabel: string;
    computedAt: string;
  };
  live: {
    totalSignalsIssued: number;
    scoredSignals: number;
    awaitingWindow: number;
    abstentions: number;
    windowTradingDays: number;
    oldestSignalDate: string | null;
    newestScoredDate: string | null;
    directionalAccuracyPct: number | null;
    buy: DirectionalOutcome;
    sell: DirectionalOutcome;
    hold: { sampleSize: number; stabilityPct: number | null };
  };
};

export default function StockSignalsPage() {
  const router = useRouter();
  const [items, setItems] = useState<SignalItem[]>([]);
  const [portfolioSignals, setPortfolioSignals] = useState<any[]>([]);
  const [brokerConnection, setBrokerConnection] = useState<{ connected: boolean; broker: string | null; expired: boolean; everConnected: boolean; lastSyncAt: string | null; lastError: string | null } | null>(null);
  const [summary, setSummary] = useState<SignalsSummary | null>(null);
  const [riskData, setRiskData] = useState<MarketRiskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanTime, setScanTime] = useState<string | null>(null);

  // Filters state
  const [sectorFilter, setSectorFilter] = useState<string>("");
  const [exchangeFilter, setExchangeFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("score");

  // Backtest state
  const [backtesting, setBacktesting] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [backtestStocks, setBacktestStocks] = useState<string[]>(["TCS.NS", "INFY.NS", "RELIANCE.NS"]);
  const [backtestDays, setBacktestDays] = useState<number>(180);

  // Track record state
  const [trackRecord, setTrackRecord] = useState<TrackRecordData | null>(null);
  const [trackRecordLoading, setTrackRecordLoading] = useState(true);
  const [trackRecordError, setTrackRecordError] = useState<string | null>(null);

  // Unique list of sectors for filter
  const sectors = Array.from(new Set(items.map((i) => i.sector))).sort();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (sectorFilter) params.set("sector", sectorFilter);
      if (exchangeFilter) params.set("exchange", exchangeFilter);
      params.set("sortBy", sortBy);

      const res = await api.get<{
        summary: SignalsSummary;
        items: SignalItem[];
        brokerConnection: any;
        portfolioSignals: any[];
        scanTime: string;
      }>(`/api/signals?${params.toString()}`);
      
      setItems(res.items);
      setSummary(res.summary);
      setBrokerConnection(res.brokerConnection);
      setPortfolioSignals(res.portfolioSignals || []);
      if (res.scanTime) {
        setScanTime(res.scanTime);
      }

      const risk = await api.get<MarketRiskData>("/api/signals/market-risk");
      setRiskData(risk);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Failed to retrieve stock signals");
    } finally {
      setLoading(false);
    }
  }, [sectorFilter, exchangeFilter, sortBy]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    // Independent of the signals list: the full-universe backtest behind this
    // can be slow on a cold cache, so it shouldn't block the rest of the page.
    api
      .get<TrackRecordData>("/api/signals/track-record")
      .then((res) => setTrackRecord(res))
      .catch((e) => setTrackRecordError(e instanceof ApiRequestError ? e.message : "Failed to load track record"))
      .finally(() => setTrackRecordLoading(false));
  }, []);

  const handleRefreshScan = async () => {
    setScanning(true);
    setError(null);
    try {
      const res = await api.post<{
        success: boolean;
        message: string;
        summary: SignalsSummary;
        items: SignalItem[];
        brokerConnection: any;
        portfolioSignals: any[];
        scanTime: string;
      }>("/api/signals/scan", {
        queryFilters: {
          sector: sectorFilter,
          exchange: exchangeFilter,
          sortBy
        }
      });

      setItems(res.items);
      setSummary(res.summary);
      setBrokerConnection(res.brokerConnection);
      setPortfolioSignals(res.portfolioSignals || []);
      if (res.scanTime) {
        setScanTime(res.scanTime);
      }

      const risk = await api.get<MarketRiskData>("/api/signals/market-risk");
      setRiskData(risk);
      alert("Market scan and broker sync completed successfully!");
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Failed to trigger scan.");
    } finally {
      setScanning(false);
    }
  };

  const handleRunBacktest = async () => {
    setBacktesting(true);
    setBacktestResult(null);
    try {
      const start = new Date(Date.now() - backtestDays * 24 * 3600 * 1000);
      const res = await api.post<BacktestResult>("/api/signals/backtest", {
        symbols: backtestStocks,
        startDate: start.toISOString(),
        endDate: new Date().toISOString(),
      });
      setBacktestResult(res);
    } catch (e) {
      alert(e instanceof ApiRequestError ? e.message : "Backtest execution failed.");
    } finally {
      setBacktesting(false);
    }
  };

  const toggleBacktestStock = (sym: string) => {
    setBacktestStocks((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]
    );
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (loading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="flex items-end gap-[3px] h-8">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-1 bg-green-custom rounded-[1px] animate-bar-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
        <div className="font-mono text-[0.7rem] tracking-[0.15em] text-text-3 animate-pulse">RUNNING SYSTEM MARKET SCAN...</div>
      </div>
    );
  }

  const riskEmoji = riskData?.classification.includes("HIGH") ? "🔴" : riskData?.classification.includes("MODERATE") ? "🟡" : "🟢";

  // Filter market list: exclude portfolio assets so they don't show up twice
  const portfolioSymbols = new Set(portfolioSignals.map((s) => s.symbol.toUpperCase().trim()));
  const marketItems = items.filter((item) => !portfolioSymbols.has(item.symbol.toUpperCase().trim()));

  // These four tabs are the market-wide screener — every scanned stock, not just
  // holdings — so counts here match the Dashboard's "Today's Market Signals" tile.
  // Portfolio holdings get their own dedicated signals section further up the page.
  const buySignals = marketItems.filter((item) => item.action.includes("BUY"));
  const sellSignals = marketItems.filter((item) => item.action.includes("SELL") || item.action === "REDUCE");
  const holdSignals = marketItems.filter((item) => item.action === "HOLD");
  const waitSignals = marketItems.filter((item) => item.action === "WAIT");

  const scanDate = scanTime ? new Date(scanTime) : null;
  const formattedScanTime = scanDate ? scanDate.toLocaleString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" }) + " IST" : "Pending";
  const isStale = scanDate ? (Date.now() - scanDate.getTime() > 4 * 3600 * 1000) : false;

  return (
    <div className="max-w-[1200px] mx-auto w-full p-4 sm:p-8 flex flex-col gap-8">
      
      {/* Header */}
      <div className="border border-border-bright bg-bg-1 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-[0.1em] text-text-custom mb-1">AI STOCK SIGNALS</h1>
          <p className="text-xs text-text-3 leading-relaxed">
            Market scan tracking: Automatically analyzed from 30+ days of historical price and volume data.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right font-mono text-[0.62rem] text-text-4">
            <div>
              SCAN STATUS:{" "}
              {isStale ? (
                <span className="text-red-custom font-bold">● STALE DATA</span>
              ) : (
                <span className="text-green-custom font-bold">● {scanning ? "Scanning..." : "Data Updated"}</span>
              )}
            </div>
            <div>SCAN RUN TIME: {formattedScanTime}</div>
          </div>
          <button 
            onClick={handleRefreshScan} 
            disabled={scanning}
            className="font-mono text-[0.65rem] tracking-[0.12em] bg-bg-3 border border-border-bright text-text-custom px-4 py-2 hover:bg-bg-4 disabled:opacity-50"
          >
            {scanning ? "SCANNING..." : "RUN LIVE SCAN NOW"}
          </button>
        </div>
      </div>

      {/* Broker Connection Status Indicator — a stale/no broker link is a
          normal, non-broken state (signals already work from holdings on
          record + live prices), so this never uses error/red styling. Red is
          reserved for an actual failed sync attempt, not "not connected". */}
      <div className="border border-border-custom bg-bg-1 p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-xs text-text-3 uppercase tracking-wider">Broker Connection:</span>
          {brokerConnection?.connected ? (
            <span className="text-[0.68rem] font-mono font-bold text-green-custom px-2 py-0.5 border border-green-custom bg-green-dim">
              🟢 ZERODHA CONNECTED
            </span>
          ) : (
            <span className="text-[0.68rem] font-mono font-bold text-text-3 px-2 py-0.5 border border-border-custom bg-bg-2">
              ⚪ {brokerConnection?.everConnected ? "AUTO-SYNC PAUSED" : "NOT CONNECTED"}
            </span>
          )}
        </div>

        {!brokerConnection?.connected && brokerConnection?.everConnected && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
            <span className="text-xs text-text-3 font-mono">
              Zerodha's daily session expired, as it does every day — signals below still use your last-synced holdings and live prices. Sync whenever it's convenient.
            </span>
            <button
              onClick={() => router.push("/portfolio")}
              className="font-mono text-[0.62rem] tracking-wider bg-bg-3 border border-border-bright text-text-custom px-3 py-1 hover:bg-bg-4 shrink-0"
            >
              SYNC ZERODHA
            </button>
          </div>
        )}

        {!brokerConnection?.connected && !brokerConnection?.everConnected && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
            <span className="text-xs text-text-3 font-mono">
              Connect Zerodha to auto-sync new trades — signals below already reflect any holdings on record.
            </span>
            <button
              onClick={() => router.push("/portfolio")}
              className="font-mono text-[0.62rem] tracking-wider bg-bg-3 border border-border-bright text-text-custom px-3 py-1 hover:bg-bg-4 shrink-0"
            >
              CONNECT BROKER
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="border border-red-custom bg-red-dim p-4 font-mono text-xs text-red-custom">
          ⚠️ ERROR: {error}
        </div>
      )}

      {/* MY PORTFOLIO SIGNALS — shown for any holdings already on record
          (broker-synced, CSV-imported, or demo), independent of whether the
          broker OAuth session happens to be fresh right now. A stale token
          only blocks pulling in new trades, not scoring the ones we already
          know about against live prices. */}
      <div className="border border-border-bright bg-bg-1 p-6 flex flex-col gap-4">
          <h2 className="font-display text-2xl tracking-[0.1em] text-text-custom border-b border-border-custom pb-2">
            MY PORTFOLIO SIGNALS
          </h2>
          {portfolioSignals.length === 0 ? (
            <div className="border border-border-custom bg-bg-2 p-6 text-center text-xs text-text-3 font-mono">
              No holdings found. Purchase assets or verify your synced holdings.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[750px]">
                <thead>
                  <tr className="border-b border-border-custom text-text-3 font-mono text-[0.58rem] tracking-wider uppercase">
                    <th className="py-3 px-2">Stock</th>
                    <th className="py-3 px-2 text-right">Qty</th>
                    <th className="py-3 px-2 text-right">Avg Price</th>
                    <th className="py-3 px-2 text-right">LTP</th>
                    <th className="py-3 px-2 text-right">P&L</th>
                    <th className="py-3 px-2 text-center">Signal</th>
                    <th className="py-3 px-2 text-center">Confidence</th>
                    <th className="py-3 px-2 text-center">Risk</th>
                    <th className="py-3 px-2 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolioSignals.map((item) => {
                    const isPlPositive = item.unrealizedPnl != null && item.unrealizedPnl >= 0;
                    const signalStyle = item.action.includes("BUY") ? "text-green-custom border-green-custom bg-green-dim" :
                                        item.action.includes("SELL") || item.action === "REDUCE" ? "text-red-custom border-red-custom bg-red-dim" :
                                        item.action === "HOLD" ? "text-blue-custom border-blue-custom bg-blue-dim" :
                                        "text-amber-custom border-amber-custom bg-amber-dim";
                    return (
                      <tr key={item.symbol} className="border-b border-border-custom hover:bg-bg-2 text-xs transition-colors duration-100">
                        <td className="py-3 px-2">
                          <div className="font-bold font-display text-sm text-text-custom">{item.displaySymbol}</div>
                          <span className="text-[0.62rem] text-text-4 font-mono">{item.exchange}</span>
                        </td>
                        <td className="py-3 px-2 text-right font-mono">{item.quantity}</td>
                        <td className="py-3 px-2 text-right font-mono">₹{item.avgPrice.toFixed(2)}</td>
                        <td className="py-3 px-2 text-right font-mono">
                          {item.currentPrice != null ? `₹${item.currentPrice.toFixed(2)}` : <span className="text-[0.62rem] text-text-4 italic">Live price unavailable</span>}
                        </td>
                        <td className={`py-3 px-2 text-right font-mono font-bold ${item.unrealizedPnl != null ? (isPlPositive ? "text-green-custom" : "text-red-custom") : "text-text-4"}`}>
                          {item.unrealizedPnl != null ? `${isPlPositive ? "+" : ""}₹${item.unrealizedPnl.toFixed(2)}` : "-"}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span className={`font-mono text-[0.62rem] font-bold px-2 py-0.5 border ${signalStyle}`}>
                            {item.action}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-center font-mono">{item.confidence}%</td>
                        <td className={`py-3 px-2 text-center font-mono font-bold ${
                          item.risk === "LOW" ? "text-green-custom" :
                          item.risk === "MODERATE" ? "text-blue-custom" :
                          item.risk === "HIGH" ? "text-amber-custom" : "text-red-custom"
                        }`}>{item.risk}</td>
                        <td className="py-3 px-2 text-center">
                          <button
                            onClick={() => router.push(`/stock/${encodeURIComponent(item.displaySymbol)}`)}
                            className="font-mono text-[0.58rem] tracking-wider border border-border-bright text-text-custom px-2 py-1 hover:bg-bg-3"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      {/* Signals Summary Counts Panel */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <button 
            onClick={() => scrollToSection("buy-section")} 
            className="border border-border-custom bg-bg-1 p-4 flex flex-col items-center cursor-pointer hover:border-green-custom hover:bg-bg-2 transition-all duration-150 text-left focus:outline-none"
          >
            <span className="font-mono text-[0.55rem] text-text-3 tracking-[0.15em] uppercase mb-1">🟢 BUY SIGNALS</span>
            <span className="font-mono text-2xl font-bold text-green-custom">{buySignals.length}</span>
          </button>
          <button 
            onClick={() => scrollToSection("sell-section")} 
            className="border border-border-custom bg-bg-1 p-4 flex flex-col items-center cursor-pointer hover:border-red-custom hover:bg-bg-2 transition-all duration-150 text-left focus:outline-none"
          >
            <span className="font-mono text-[0.55rem] text-text-3 tracking-[0.15em] uppercase mb-1">🔴 SELL / REDUCE</span>
            <span className="font-mono text-2xl font-bold text-red-custom">{sellSignals.length}</span>
          </button>
          <button 
            onClick={() => scrollToSection("hold-section")} 
            className="border border-border-custom bg-bg-1 p-4 flex flex-col items-center cursor-pointer hover:border-blue-custom hover:bg-bg-2 transition-all duration-150 text-left focus:outline-none"
          >
            <span className="font-mono text-[0.55rem] text-text-3 tracking-[0.15em] uppercase mb-1">🟡 HOLD</span>
            <span className="font-mono text-2xl font-bold text-blue-custom">{holdSignals.length}</span>
          </button>
          <button 
            onClick={() => scrollToSection("wait-section")} 
            className="border border-border-custom bg-bg-1 p-4 flex flex-col items-center cursor-pointer hover:border-amber-custom hover:bg-bg-2 transition-all duration-150 text-left focus:outline-none"
          >
            <span className="font-mono text-[0.55rem] text-text-3 tracking-[0.15em] uppercase mb-1">⚪ WAIT</span>
            <span className="font-mono text-2xl font-bold text-amber-custom">{waitSignals.length}</span>
          </button>
        </div>
      )}

      {/* Market Risk Section */}
      {riskData && (
        <div className="border border-border-bright bg-bg-1 p-6">
          <h2 className="font-mono text-[0.68rem] tracking-[0.18em] text-text-3 uppercase mb-4">BROAD MARKET RISK RADAR</h2>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            
            {/* Gauge */}
            <div className="md:col-span-4 flex flex-col items-center border-r border-border-custom pr-6">
              <span className="font-mono text-[0.55rem] text-text-3 tracking-[0.15em] uppercase mb-1">MARKET RISK SCORE</span>
              <span className="font-mono text-4xl font-bold text-text-custom mb-1">{riskData.score} <span className="text-text-4 text-xs font-normal">/ 100</span></span>
              <span className={`font-mono text-xs font-bold px-2 py-0.5 border ${
                riskData.score >= 70 ? "text-red-custom" :
                riskData.score >= 45 ? "text-amber-custom" : "text-green-custom"
              }`}>
                {riskEmoji} {riskData.classification}
              </span>
            </div>

            {/* Explanatory Factors */}
            <div className="md:col-span-8 flex flex-col gap-3">
              <div className="font-mono text-[0.55rem] text-text-3 tracking-[0.12em] uppercase">RISK FACTORS DETECTED:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {riskData.factors.map((f) => (
                  <div key={f.key} className="flex justify-between items-center text-xs border-b border-border-custom pb-1">
                    <span className="text-text-2">{f.label}</span>
                    <span className={`font-mono font-bold ${
                      f.score == null ? "text-text-4" :
                      f.score >= 70 ? "text-red-custom" :
                      f.score >= 45 ? "text-amber-custom" : "text-green-custom"
                    }`}>
                      {f.score ?? "N/A"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="p-3 border border-border-custom bg-bg-2">
                <span className="font-mono text-[0.52rem] text-red-custom tracking-[0.1em] uppercase block mb-1">WHY IS RISK LEVEL {riskData.classification.split(" ")[0]}?</span>
                <p className="text-xs text-text-2 leading-relaxed">{riskData.reasons.join(" ")}</p>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Global Sorters and Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-custom pb-3">
        <span className="font-mono text-[0.68rem] tracking-[0.15em] text-text-3 uppercase">🌍 BROAD MARKET WATCH SIGNALS</span>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="font-mono text-[0.62rem] bg-bg border border-border-custom text-text-2 p-1.5 focus:outline-none focus:border-border-bright"
          >
            <option value="">ALL SECTORS</option>
            {sectors.map((sec) => (
              <option key={sec} value={sec}>{sec.toUpperCase()}</option>
            ))}
          </select>

          <select
            value={exchangeFilter}
            onChange={(e) => setExchangeFilter(e.target.value)}
            className="font-mono text-[0.62rem] bg-bg border border-border-custom text-text-2 p-1.5 focus:outline-none focus:border-border-bright"
          >
            <option value="">ALL EXCHANGES</option>
            <option value="NSE">NSE (INDIA)</option>
            <option value="GLOBAL">GLOBAL (US)</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="font-mono text-[0.62rem] bg-bg border border-border-custom text-text-2 p-1.5 focus:outline-none focus:border-border-bright"
          >
            <option value="score">SORT BY SCORE (DESC)</option>
            <option value="confidence">SORT BY CONFIDENCE</option>
            <option value="risk">SORT BY RISK LEVEL</option>
            <option value="symbol">SORT BY SYMBOL</option>
          </select>
        </div>
      </div>

      {/* Signal Categories Grid */}
      <div className="flex flex-col gap-8">
        
        {/* 🟢 TOP BUY SIGNALS */}
        <div id="buy-section" className="border border-green-custom bg-bg-1 p-6 flex flex-col gap-4">
          <h2 className="font-display text-2xl tracking-[0.1em] text-green-custom border-b border-border-custom pb-2">🟢 TOP BUY SIGNALS</h2>
          <div className="flex flex-col gap-4">
            {buySignals.length === 0 ? (
              <div className="border border-border-custom bg-bg-2 p-4 text-center text-xs text-text-3 font-mono">
                No active BUY signals currently calculated.
              </div>
            ) : (
              buySignals.map((item) => (
                <SignalCard key={item.id} item={item} />
              ))
            )}
          </div>
        </div>

        {/* 🔴 SELL / REDUCE */}
        <div id="sell-section" className="border border-red-custom bg-bg-1 p-6 flex flex-col gap-4">
          <h2 className="font-display text-2xl tracking-[0.1em] text-red-custom border-b border-border-custom pb-2">🔴 SELL / REDUCE SIGNALS</h2>
          <div className="flex flex-col gap-4">
            {sellSignals.length === 0 ? (
              <div className="border border-border-custom bg-bg-2 p-4 text-center text-xs text-text-3 font-mono">
                No active SELL or REDUCE signals currently calculated.
              </div>
            ) : (
              sellSignals.map((item) => (
                <SignalCard key={item.id} item={item} />
              ))
            )}
          </div>
        </div>

        {/* 🟡 HOLD */}
        <div id="hold-section" className="border border-blue-custom bg-bg-1 p-6 flex flex-col gap-4">
          <h2 className="font-display text-2xl tracking-[0.1em] text-blue-custom border-b border-border-custom pb-2">🟡 HOLD SIGNALS</h2>
          <div className="flex flex-col gap-4">
            {holdSignals.length === 0 ? (
              <div className="border border-border-custom bg-bg-2 p-4 text-center text-xs text-text-3 font-mono">
                No active HOLD signals currently calculated.
              </div>
            ) : (
              holdSignals.map((item) => (
                <SignalCard key={item.id} item={item} />
              ))
            )}
          </div>
        </div>

        {/* ⚪ WAIT */}
        <div id="wait-section" className="border border-amber-custom bg-bg-1 p-6 flex flex-col gap-4">
          <h2 className="font-display text-2xl tracking-[0.1em] text-amber-custom border-b border-border-custom pb-2">⚪ WAIT SIGNALS</h2>
          <div className="flex flex-col gap-4">
            {waitSignals.length === 0 ? (
              <div className="border border-border-custom bg-bg-2 p-4 text-center text-xs text-text-3 font-mono">
                No active WAIT signals currently calculated.
              </div>
            ) : (
              waitSignals.map((item) => (
                <SignalCard key={item.id} item={item} />
              ))
            )}
          </div>
        </div>

      </div>

      {/* AI Track Record */}
      <div className="border border-border-bright bg-bg-1 p-6 flex flex-col gap-6">
        <div>
          <h2 className="font-display text-2xl tracking-[0.1em] text-text-custom">AI TRACK RECORD</h2>
          <p className="text-xs text-text-3 leading-relaxed mt-1">
            How this engine's calls have actually done — real signals checked against real price moves, plus a historical replay across the full universe. Nothing here is a forecast.
          </p>
        </div>

        {trackRecordLoading ? (
          <div className="text-center font-mono text-xs text-text-3 animate-pulse py-6">Loading track record...</div>
        ) : trackRecordError || !trackRecord ? (
          <div className="text-center font-mono text-xs text-text-3 py-6">{trackRecordError || "Track record unavailable."}</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LIVE */}
            <div className="border border-border-custom bg-bg-2 p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-mono text-[0.6rem] tracking-[0.15em] text-cyan-custom uppercase">● LIVE SIGNAL ACCURACY</span>
                <span className="font-mono text-[0.55rem] text-text-4">{trackRecord.live.scoredSignals} scored</span>
              </div>

              {trackRecord.live.scoredSignals === 0 ? (
                <div className="text-xs text-text-3 leading-relaxed">
                  No real signals have crossed their {trackRecord.live.windowTradingDays}-trading-day check window yet.
                  {trackRecord.live.awaitingWindow > 0 && ` ${trackRecord.live.awaitingWindow} signals are logged and waiting on that window — check back soon.`}
                </div>
              ) : (
                <>
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-3xl font-bold text-text-custom">
                      {trackRecord.live.directionalAccuracyPct ?? "—"}{trackRecord.live.directionalAccuracyPct !== null ? "%" : ""}
                    </span>
                    <span className="text-[0.62rem] text-text-3 font-mono uppercase leading-tight">directional accuracy<br />(buy + sell calls)</span>
                  </div>

                  <div className="flex flex-col gap-2 font-mono text-[0.68rem]">
                    <div className="flex justify-between items-center border-t border-border-custom pt-2">
                      <span className="text-green-custom">BUY calls</span>
                      <span className="text-text-2 text-right">
                        {trackRecord.live.buy.sampleSize === 0
                          ? "no sample yet"
                          : `${trackRecord.live.buy.accuracyPct}% correct · ${trackRecord.live.buy.sampleSize} scored · avg ${trackRecord.live.buy.avgReturnPct! >= 0 ? "+" : ""}${trackRecord.live.buy.avgReturnPct}%`}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-red-custom">SELL / REDUCE calls</span>
                      <span className="text-text-2 text-right">
                        {trackRecord.live.sell.sampleSize === 0
                          ? "no sample yet"
                          : `${trackRecord.live.sell.accuracyPct}% correct · ${trackRecord.live.sell.sampleSize} scored · avg ${trackRecord.live.sell.avgReturnPct! >= 0 ? "+" : ""}${trackRecord.live.sell.avgReturnPct}%`}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-text-3">HOLD calls</span>
                      <span className="text-text-2 text-right">
                        {trackRecord.live.hold.sampleSize === 0
                          ? "no sample yet"
                          : `${trackRecord.live.hold.stabilityPct}% stayed within ±3% · ${trackRecord.live.hold.sampleSize} scored`}
                      </span>
                    </div>
                  </div>
                </>
              )}

              <span className="text-[0.55rem] text-text-4 leading-relaxed">
                {trackRecord.live.oldestSignalDate ? `Tracking since ${trackRecord.live.oldestSignalDate}. ` : ""}
                Each signal is scored {trackRecord.live.windowTradingDays} trading days after it was issued, against that stock's real subsequent price.
                {trackRecord.live.awaitingWindow > 0 ? ` ${trackRecord.live.awaitingWindow} more are still inside that window.` : ""}{" "}
                This sample grows the longer the scanner runs — treat early numbers as directional, not definitive.
              </span>
            </div>

            {/* BACKTESTED */}
            <div className="border border-border-custom bg-bg-2 p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-mono text-[0.6rem] tracking-[0.15em] text-text-3 uppercase">◆ HISTORICAL REPLAY</span>
                <span className="font-mono text-[0.55rem] text-text-4">{trackRecord.backtested.symbolsCovered} NSE stocks · {trackRecord.backtested.windowLabel}</span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center">
                  <span className="font-mono text-xl font-bold text-text-custom">{trackRecord.backtested.winRate}%</span>
                  <span className="font-mono text-[0.52rem] text-text-3 uppercase">Win rate</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className={`font-mono text-xl font-bold ${trackRecord.backtested.averageReturn >= 0 ? "text-green-custom" : "text-red-custom"}`}>
                    {trackRecord.backtested.averageReturn >= 0 ? "+" : ""}{trackRecord.backtested.averageReturn}%
                  </span>
                  <span className="font-mono text-[0.52rem] text-text-3 uppercase">Avg trade</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="font-mono text-xl font-bold text-red-custom">-{trackRecord.backtested.maxDrawdown}%</span>
                  <span className="font-mono text-[0.52rem] text-text-3 uppercase">Max drawdown</span>
                </div>
              </div>

              <div className="flex justify-between items-center font-mono text-[0.68rem] border-t border-border-custom pt-3">
                <span className="text-text-3">NIFTY 50 buy &amp; hold, same window:</span>
                <span className="font-bold text-text-2">
                  {trackRecord.backtested.benchmarkReturn === null
                    ? "—"
                    : `${trackRecord.backtested.benchmarkReturn >= 0 ? "+" : ""}${trackRecord.backtested.benchmarkReturn}%`}
                </span>
              </div>

              <span className="text-[0.55rem] text-text-4 leading-relaxed">
                Simulated day-by-day replay of the current decision engine over {trackRecord.backtested.symbolsCovered} real historical price series, {trackRecord.backtested.totalTrades} total trades, avg hold {trackRecord.backtested.averageHoldingPeriod} days.
                Past performance does not guarantee future results — this shows how today's engine logic would have called it, not what it will do next.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Backtesting Dashboard Widget */}
      <div className="border border-border-bright bg-bg-1 p-6">
        <h2 className="font-mono text-[0.68rem] tracking-[0.18em] text-text-3 uppercase mb-4">SYSTEM BACKTEST ENGINE</h2>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* Controls */}
          <div className="md:col-span-4 flex flex-col gap-4 border-r border-border-custom pr-6">
            <div className="font-mono text-[0.55rem] text-text-3 tracking-[0.12em] uppercase">BACKTEST SETTINGS:</div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-[0.62rem] text-text-3 uppercase font-mono">Test Universe (NSE):</label>
              <div className="flex flex-col gap-1 border border-border-custom bg-bg-2 p-2 max-h-[120px] overflow-y-auto">
                {["TCS.NS", "INFY.NS", "RELIANCE.NS", "SBIN.NS", "HDFCBANK.NS"].map((sym) => (
                  <label key={sym} className="flex items-center gap-2 text-xs text-text-2 cursor-pointer font-mono">
                    <input
                      type="checkbox"
                      checked={backtestStocks.includes(sym)}
                      onChange={() => toggleBacktestStock(sym)}
                    />
                    {sym.replace(".NS", "")}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[0.62rem] text-text-3 uppercase font-mono">Time Horizon:</label>
              <select
                value={backtestDays}
                onChange={(e) => setBacktestDays(Number(e.target.value))}
                className="font-mono text-[0.62rem] bg-bg-2 border border-border-custom text-text-2 p-1.5"
              >
                <option value={30}>30 DAYS LOOKBACK</option>
                <option value={90}>90 DAYS LOOKBACK</option>
                <option value={180}>180 DAYS LOOKBACK</option>
                <option value={365}>365 DAYS LOOKBACK</option>
              </select>
            </div>

            <button
              onClick={handleRunBacktest}
              disabled={backtesting}
              className="font-mono text-[0.65rem] tracking-[0.12em] bg-green-custom border border-none text-bg font-bold px-4 py-2 hover:opacity-85 disabled:opacity-50"
            >
              {backtesting ? "SIMULATING..." : "RUN SIMULATED BACKTEST"}
            </button>
          </div>

          {/* Results Display */}
          <div className="md:col-span-8 flex flex-col justify-center">
            {backtesting ? (
              <div className="text-center font-mono text-xs text-text-3 animate-pulse">
                Processing historical candles... modeling entries, stop losses, and target ranges...
              </div>
            ) : backtestResult ? (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="border border-border-custom p-3 flex flex-col items-center bg-bg-2">
                    <span className="font-mono text-[0.52rem] text-text-3 uppercase">Total Trades</span>
                    <span className="font-mono text-lg font-bold text-text-custom">{backtestResult.totalTrades}</span>
                  </div>
                  <div className="border border-border-custom p-3 flex flex-col items-center bg-bg-2">
                    <span className="font-mono text-[0.52rem] text-text-3 uppercase">Win Rate</span>
                    <span className="font-mono text-lg font-bold text-green-custom">{backtestResult.winRate}%</span>
                  </div>
                  <div className="border border-border-custom p-3 flex flex-col items-center bg-bg-2">
                    <span className="font-mono text-[0.52rem] text-text-3 uppercase">Avg Trade Return</span>
                    <span className="font-mono text-lg font-bold text-text-custom">{backtestResult.averageReturn}%</span>
                  </div>
                  <div className="border border-border-custom p-3 flex flex-col items-center bg-bg-2">
                    <span className="font-mono text-[0.52rem] text-text-3 uppercase">Max Drawdown</span>
                    <span className="font-mono text-lg font-bold text-red-custom">-{backtestResult.maxDrawdown}%</span>
                  </div>
                </div>

                <div className="p-3 border border-border-custom bg-bg-2">
                  <span className="font-mono text-[0.55rem] text-green-custom uppercase block mb-1">BENCHMARK COMPARISON</span>
                  <div className="flex justify-between text-xs text-text-2">
                    <span>Backtested Signal Returns:</span>
                    <span className="font-bold text-green-custom">+{backtestResult.averageReturn * backtestResult.totalTrades}%</span>
                  </div>
                  <div className="flex justify-between text-xs text-text-2 mt-1">
                    <span>NIFTY 50 Buy & Hold Returns:</span>
                    <span className="font-bold">
                      {backtestResult.benchmarkReturn === null ? "—" : `${backtestResult.benchmarkReturn >= 0 ? "+" : ""}${backtestResult.benchmarkReturn}%`}
                    </span>
                  </div>
                  <span className="text-[0.55rem] text-text-4 block mt-2">
                    *Based on simulated historical paper signals. Past performance does not guarantee future returns.
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center font-mono text-xs text-text-3">
                No active simulation loaded. Adjust parameters and click execute to view historical engine returns.
              </div>
            )}
          </div>

        </div>
      </div>

    </div>
  );
}

function SignalCard({ item }: { item: SignalItem }) {
  const router = useRouter();
  const isGlobal = item.exchange === "GLOBAL";
  const currency = isGlobal ? "$" : "₹";
  
  const cardStyle = item.action.includes("BUY") ? "text-green-custom border-green-custom bg-green-dim" :
                    item.action.includes("SELL") || item.action === "REDUCE" ? "text-red-custom border-red-custom bg-red-dim" :
                    item.action === "HOLD" ? "text-blue-custom border-blue-custom bg-blue-dim" :
                    "text-amber-custom border-amber-custom bg-amber-dim";

  return (
    <div className="border border-border-bright bg-bg-2 p-5 flex flex-col gap-4 rounded">
      
      {/* Top summary row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-border-custom pb-3">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-display text-xl tracking-wider text-text-custom">{item.displaySymbol}</span>
            <span className="font-mono text-[0.52rem] text-text-4 px-1 py-[1px] border border-border-custom">{item.exchange}</span>
            <span className="font-mono text-[0.52rem] text-blue-custom px-1.5 py-[1px] border border-border-custom bg-blue-dim">{item.sector.toUpperCase()}</span>
          </div>
          <span className="text-[0.62rem] text-text-3 block">{item.name}</span>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <span className="font-mono text-[0.52rem] text-text-4 block uppercase text-right">SIGNAL</span>
            <span className={`font-mono text-xs font-bold px-2 py-0.5 border ${cardStyle}`}>{item.action}</span>
          </div>
          <div>
            <span className="font-mono text-[0.52rem] text-text-4 block uppercase text-right">SCORE</span>
            <span className="font-mono text-sm font-bold text-text-custom">{item.score}/100</span>
          </div>
          <div>
            <span className="font-mono text-[0.52rem] text-text-4 block uppercase text-right">CONFIDENCE</span>
            <span className="font-mono text-sm font-bold text-text-custom">{item.confidence}%</span>
          </div>
          <div>
            <span className="font-mono text-[0.52rem] text-text-4 block uppercase text-right">RISK</span>
            <span className={`font-mono text-[0.62rem] font-bold ${
              item.risk === "LOW" ? "text-green-custom" :
              item.risk === "MODERATE" ? "text-blue-custom" :
              item.risk === "HIGH" ? "text-amber-custom" : "text-red-custom"
            }`}>{item.risk}</span>
          </div>
          <button
            onClick={() => router.push(`/stock/${encodeURIComponent(item.displaySymbol)}`)}
            className="font-mono text-[0.58rem] tracking-[0.1em] border border-green-custom text-green-custom bg-green-dim px-3 py-1.5 hover:opacity-85"
          >
            VIEW FULL ANALYSIS
          </button>
        </div>
      </div>

      {/* Levels display for BUY */}
      {item.action.includes("BUY") && item.entryZone && item.stopLoss && item.targetRange && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border border-green-custom bg-green-dim p-3">
          <div>
            <span className="font-mono text-[0.52rem] text-green-custom uppercase block mb-0.5">Suggested Entry Zone</span>
            <span className="font-mono text-xs font-bold text-text-custom">{currency}{item.entryZone.min.toFixed(2)} – {currency}{item.entryZone.max.toFixed(2)}</span>
          </div>
          <div>
            <span className="font-mono text-[0.52rem] text-red-custom uppercase block mb-0.5">Model Stop-Loss</span>
            <span className="font-mono text-xs font-bold text-text-custom">{currency}{item.stopLoss.toFixed(2)}</span>
          </div>
          <div>
            <span className="font-mono text-[0.52rem] text-blue-custom uppercase block mb-0.5">Model Target Range</span>
            <span className="font-mono text-xs font-bold text-text-custom">{currency}{item.targetRange.min.toFixed(2)} – {currency}{item.targetRange.max.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Explainer bullets */}
      <div>
        <span className="font-mono text-[0.52rem] text-text-3 tracking-[0.1em] uppercase block mb-1">DECISION JUSTIFICATIONS:</span>
        <ul className="flex flex-col gap-1 pr-2">
          {item.reasons.map((r, idx) => (
            <li key={idx} className="text-xs text-text-2 flex gap-1.5 items-start">
              <span className="text-green-custom shrink-0">✓</span> {r}
            </li>
          ))}
          {item.warnings.map((w, idx) => (
            <li key={idx} className="text-xs text-text-3 flex gap-1.5 items-start">
              <span className="text-red-custom shrink-0">✕</span> {w}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
