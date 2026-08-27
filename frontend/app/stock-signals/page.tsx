"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, ApiRequestError, API_BASE, apiFetch } from "../lib/api";

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
  benchmarkReturn: number;
  trades: BacktestTrade[];
};

export default function StockSignalsPage() {
  const [items, setItems] = useState<SignalItem[]>([]);
  const [summary, setSummary] = useState<SignalsSummary | null>(null);
  const [riskData, setRiskData] = useState<MarketRiskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [holdingStocks, setHoldingStocks] = useState<string[]>([]);

  // Filters state
  const [sectorFilter, setSectorFilter] = useState<string>("");
  const [exchangeFilter, setExchangeFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("score");

  // Backtest state
  const [backtesting, setBacktesting] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [backtestStocks, setBacktestStocks] = useState<string[]>(["TCS.NS", "INFY.NS", "RELIANCE.NS"]);
  const [backtestDays, setBacktestDays] = useState<number>(180);

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

      const res = await api.get<{ summary: SignalsSummary; items: SignalItem[] }>(`/api/signals?${params.toString()}`);
      setItems(res.items);
      setSummary(res.summary);

      const risk = await api.get<MarketRiskData>("/api/signals/market-risk");
      setRiskData(risk);

      // Fetch user holdings to filter SELL, HOLD, and WAIT signals
      try {
        const holdData = await apiFetch<{ holdings: any[] }>("/api/portfolio");
        const symbols = (holdData.holdings || []).map((h: any) => h.stock.toUpperCase().trim());
        setHoldingStocks(symbols);
      } catch (err) {
        console.error("Failed to load portfolio holdings for AI signals:", err);
      }
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Failed to retrieve stock signals");
    } finally {
      setLoading(false);
    }
  }, [sectorFilter, exchangeFilter, sortBy]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefreshScan = async () => {
    try {
      await api.post("/api/signals/scan", {});
      alert("Background scan triggered successfully! Please wait a moment and refresh.");
      loadData();
    } catch {
      alert("Failed to trigger scan.");
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

  // Scroll helper
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

  // Segment signals by category (restricting SELL, HOLD, and WAIT to owned stocks only)
  const buySignals = items.filter((item) => item.action.includes("BUY"));
  const sellSignals = items.filter((item) => 
    (item.action.includes("SELL") || item.action === "REDUCE") && 
    holdingStocks.includes(item.symbol.toUpperCase().trim())
  );
  const holdSignals = items.filter((item) => 
    item.action === "HOLD" && 
    holdingStocks.includes(item.symbol.toUpperCase().trim())
  );
  const waitSignals = items.filter((item) => 
    item.action === "WAIT" && 
    holdingStocks.includes(item.symbol.toUpperCase().trim())
  );

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
            <div>SCAN STATUS: <span className="text-green-custom font-bold">● Data Updated</span></div>
            <div>SCAN RUN TIME: {riskData?.createdAt ? new Date(riskData.createdAt).toLocaleTimeString() : "Pending"}</div>
          </div>
          <button onClick={handleRefreshScan} className="font-mono text-[0.65rem] tracking-[0.12em] bg-bg-3 border border-border-bright text-text-custom px-4 py-2 hover:bg-bg-4">
            RUN LIVE SCAN NOW
          </button>
        </div>
      </div>

      {error && (
        <div className="border border-red-custom bg-red-dim p-4 font-mono text-xs text-red-custom">
          ⚠️ ERROR: {error}. Please ensure the backend server and database are running, and database schema has been pushed using `npx prisma db push`.
        </div>
      )}

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
        <span className="font-mono text-[0.68rem] tracking-[0.15em] text-text-3 uppercase">UNIVERSE INTELLIGENCE REPORT</span>
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
                <option value={90}>90 DAYS</option>
                <option value={180}>180 DAYS</option>
                <option value={365}>1 YEAR</option>
              </select>
            </div>

            <button
              onClick={handleRunBacktest}
              disabled={backtesting || backtestStocks.length === 0}
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
                    <span>NIFTY 50 Buy & Hold Returns (proxy):</span>
                    <span className="font-bold">+{backtestResult.benchmarkReturn}%</span>
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
