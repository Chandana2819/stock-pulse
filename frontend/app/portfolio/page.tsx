"use client";

import { useEffect, useState, useCallback } from "react";
import NotificationSystem, { Toast } from "../components/NotificationSystem";
import PortfolioDoctor from "../components/PortfolioDoctor";
import SignalDetailModal, { SignalDetailData } from "../components/SignalDetailModal";
import { getPositionGuidance } from "../lib/positionGuidance";
import { API_BASE, apiFetch } from "../lib/api";

function WarningIcon() {
  return (
    <svg className="w-3 h-3 inline-block -mt-0.5 text-amber-custom" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

type Holding = {
  id: string;
  stock: string;
  displaySym: string;
  exchange: string;
  avgPrice: number;
  quantity: number;
  currency: "INR" | "USD";
  currentPrice: number;
  cost: number;
  value: number;
  pl: number;
  plPct: number;
};

type MfHolding = {
  id: string;
  schemeCode: string;
  schemeName: string;
  folioNumber: string | null;
  units: number;
  avgNav: number;
  currentNav: number;
  navDate?: string | null;
  category?: string;
  fundHouse?: string;
  invested: number;
  currentValue: number;
  pl: number;
  plPct: number;
  source: string;
  broker: string | null;
  createdAt: string;
};

type MfSummary = {
  totalInvested: number;
  totalValue: number;
  totalPl: number;
  totalPlPct: number;
  fundCount: number;
  totalUnits: number;
};

type Transaction = {
  id: string;
  stock: string;
  type: "BUY" | "SELL";
  price: number;
  quantity: number;
  fee: number;
  totalCost: number;
  createdAt: string;
};

export default function PortfolioPage() {
  const [activeAssetTab, setActiveAssetTab] = useState<"STOCKS" | "MUTUAL_FUNDS">("STOCKS");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [mfHoldings, setMfHoldings] = useState<MfHolding[]>([]);
  const [mfSummary, setMfSummary] = useState<MfSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [wallet, setWallet] = useState<{ inr: number; usd: number }>({ inr: 0, usd: 0 });
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [aiSignals, setAiSignals] = useState<any[]>([]);

  // Mutual Fund modal & form states
  const [showAddMfModal, setShowAddMfModal] = useState(false);
  const [mfSearchQuery, setMfSearchQuery] = useState("");
  const [mfSearchResults, setMfSearchResults] = useState<Array<{ schemeCode: string; schemeName: string }>>([]);
  const [mfSearching, setMfSearching] = useState(false);
  const [selectedMfScheme, setSelectedMfScheme] = useState<{ schemeCode: string; schemeName: string } | null>(null);
  const [mfUnits, setMfUnits] = useState("");
  const [mfAvgNav, setMfAvgNav] = useState("");
  const [mfFolio, setMfFolio] = useState("");
  const [savingMf, setSavingMf] = useState(false);

  const [showMfCsvModal, setShowMfCsvModal] = useState(false);
  const [mfCsvFile, setMfCsvFile] = useState<File | null>(null);
  const [uploadingMfCsv, setUploadingMfCsv] = useState(false);

  // Signal detail modal states
  const [selectedModalHolding, setSelectedModalHolding] = useState<Holding | null>(null);
  const [selectedModalSignal, setSelectedModalSignal] = useState<SignalDetailData | null>(null);
  const [selectedModalWeight, setSelectedModalWeight] = useState<number>(0);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Transaction form states
  const [formStock, setFormStock] = useState("");
  const [formType, setFormType] = useState<"BUY" | "SELL">("BUY");
  const [formQty, setFormQty] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formIsVirtual, setFormIsVirtual] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Broker states
  const [brokerSelect, setBrokerSelect] = useState("DEMO");
  const [brokerUserId, setBrokerUserId] = useState("");
  const [brokerPassword, setBrokerPassword] = useState("");
  const [connectingBroker, setConnectingBroker] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [brokerConnections, setBrokerConnections] = useState<any[]>([]);
  const [syncingBroker, setSyncingBroker] = useState<string | null>(null);

  const addToast = useCallback((toast: Omit<Toast, "id" | "timestamp">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-3), { ...toast, id, timestamp: Date.now() }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Holdings & Wallet & Mutual Funds
      const holdData = await apiFetch<{
        holdings: Holding[];
        mfHoldings?: MfHolding[];
        mfSummary?: MfSummary;
        user?: { walletInr: number; walletUsd: number };
      }>("/api/portfolio");
      setHoldings(holdData.holdings || []);
      setMfHoldings(holdData.mfHoldings || []);
      setMfSummary(holdData.mfSummary || null);
      if (holdData.user) {
        setWallet({
          inr: holdData.user.walletInr,
          usd: holdData.user.walletUsd,
        });
      } else {
        setWallet({ inr: 0, usd: 0 });
      }

      // 2. Fetch Transactions
      const txData = await apiFetch<any>("/api/transactions");
      setTransactions(Array.isArray(txData) ? txData : txData?.items ?? []);

      // 3. Fetch Broker Connections
      const brokerData = await apiFetch<{ connections: any[] }>("/api/brokers");
      setBrokerConnections(brokerData.connections || []);

      // 4. Fetch AI Signals
      try {
        const portSignals = await apiFetch<{ holdings?: any[] }>("/api/portfolio/signals").catch(() => null);
        if (portSignals?.holdings && Array.isArray(portSignals.holdings) && portSignals.holdings.length > 0) {
          setAiSignals(portSignals.holdings);
          // Check for critical stop loss breaches
          portSignals.holdings.forEach((ps: any) => {
            if (ps.stopLoss && ps.currentPrice && ps.currentPrice <= ps.stopLoss) {
              addToast({
                type: "danger",
                title: `Stop-Loss Alert: ${ps.symbol}`,
                message: `${ps.symbol} has breached its stop-loss level of ₹${ps.stopLoss.toFixed(2)} (CMP: ₹${ps.currentPrice.toFixed(2)}).`
              });
            }
          });
        } else {
          const signalsData = await apiFetch<{ items?: any[]; portfolioSignals?: any[] }>("/api/signals").catch(() => null);
          const combined = [
            ...(signalsData?.portfolioSignals || []),
            ...(signalsData?.items || [])
          ];
          setAiSignals(combined);
        }
      } catch (err) {
        console.error("Failed to load AI signals for portfolio:", err);
      }
    } catch (e) {
      console.error("Failed to load portfolio statistics:", e);
      addToast({ type: "danger", title: "Error", message: "Failed to sync portfolio data." });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time live synchronization interval
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchData();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  // Handle Position Deletion
  const handleDeletePosition = async (stock: string) => {
    if (!confirm(`Are you sure you want to force-delete the position in ${stock}? This will wipe out the holding record.`)) return;

    try {
      await apiFetch(`/api/portfolio?stock=${stock}`, {
        method: "DELETE",
      });
      addToast({ type: "success", title: "Position Deleted", message: `Successfully wiped ${stock} holding.` });
      fetchData();
      window.dispatchEvent(new CustomEvent("wallet-update"));
    } catch (err) {
      addToast({
        type: "danger",
        title: "Deletion Failed",
        message: err instanceof Error ? err.message : "Wipe failed.",
      });
    }
  };

  // Mutual Funds: Search AMFI schemes
  const handleMfSearch = async (q: string) => {
    setMfSearchQuery(q);
    if (!q.trim() || q.trim().length < 2) {
      setMfSearchResults([]);
      return;
    }
    setMfSearching(true);
    try {
      const res = await apiFetch<{ results: Array<{ schemeCode: string; schemeName: string }> }>(
        `/api/mutual-funds/search?q=${encodeURIComponent(q)}`
      );
      setMfSearchResults(res.results || []);
    } catch {
      setMfSearchResults([]);
    } finally {
      setMfSearching(false);
    }
  };

  const handleSelectScheme = async (scheme: { schemeCode: string; schemeName: string }) => {
    setSelectedMfScheme(scheme);
    setMfSearchQuery(scheme.schemeName);
    setMfSearchResults([]);
    try {
      const detail = await apiFetch<{ nav?: number }>(`/api/mutual-funds/${scheme.schemeCode}`);
      if (detail.nav && !mfAvgNav) {
        setMfAvgNav(detail.nav.toFixed(4));
      }
    } catch {}
  };

  const handleSaveMf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMfScheme || !mfUnits || !mfAvgNav) {
      addToast({ type: "danger", title: "Incomplete Form", message: "Please select a scheme and enter units & NAV." });
      return;
    }
    const unitsNum = parseFloat(mfUnits);
    const navNum = parseFloat(mfAvgNav);
    if (isNaN(unitsNum) || unitsNum <= 0 || isNaN(navNum) || navNum <= 0) {
      addToast({ type: "danger", title: "Invalid Input", message: "Units and NAV must be positive numbers." });
      return;
    }
    setSavingMf(true);
    try {
      await apiFetch("/api/mutual-funds/holdings/mine", {
        method: "POST",
        body: JSON.stringify({
          schemeCode: selectedMfScheme.schemeCode,
          schemeName: selectedMfScheme.schemeName,
          units: unitsNum,
          avgNav: navNum,
          folioNumber: mfFolio.trim() || undefined,
        }),
      });
      addToast({
        type: "success",
        title: "Mutual Fund Added",
        message: `${selectedMfScheme.schemeName.slice(0, 30)}... added to your portfolio!`,
      });
      setShowAddMfModal(false);
      setSelectedMfScheme(null);
      setMfSearchQuery("");
      setMfUnits("");
      setMfAvgNav("");
      setMfFolio("");
      fetchData();
    } catch (err) {
      addToast({
        type: "danger",
        title: "Save Failed",
        message: err instanceof Error ? err.message : "Failed to record mutual fund holding.",
      });
    } finally {
      setSavingMf(false);
    }
  };

  const handleDeleteMf = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove "${name}" from your portfolio?`)) return;
    try {
      await apiFetch(`/api/mutual-funds/holdings/mine/${id}`, { method: "DELETE" });
      addToast({ type: "info", title: "Removed", message: "Mutual fund removed from portfolio." });
      fetchData();
    } catch (err) {
      addToast({ type: "danger", title: "Delete Failed", message: err instanceof Error ? err.message : "Failed to delete holding." });
    }
  };

  const handleMfCsvSubmit = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        setUploadingMfCsv(true);
        const text = e.target?.result as string;
        const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) throw new Error("CSV contains no data rows");

        const headers = lines[0].toLowerCase().split(",").map((h) => h.replace(/["']/g, "").trim());
        const schemeIdx = headers.findIndex((h) => h.includes("scheme") || h.includes("fund") || h.includes("name") || h.includes("instrument"));
        const unitsIdx = headers.findIndex((h) => h.includes("unit") || h.includes("qty") || h.includes("quantity") || h.includes("balance"));
        const navIdx = headers.findIndex((h) => h.includes("nav") || h.includes("avg") || h.includes("cost") || h.includes("price") || h.includes("buy"));
        const folioIdx = headers.findIndex((h) => h.includes("folio"));
        const codeIdx = headers.findIndex((h) => h.includes("code") || h.includes("isin") || h.includes("symbol"));

        if (schemeIdx === -1 && codeIdx === -1) {
          throw new Error("Could not find a Scheme/Fund Name or Scheme Code column in CSV.");
        }
        if (unitsIdx === -1) {
          throw new Error("Could not find a Units/Quantity column in CSV.");
        }

        const items: Array<{ schemeName: string; schemeCode?: string; units: number; avgNav: number; folioNumber?: string }> = [];

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map((c) => c.replace(/["']/g, "").trim());
          const schemeName = schemeIdx !== -1 ? cols[schemeIdx] : "";
          const schemeCode = codeIdx !== -1 ? cols[codeIdx] : undefined;
          const units = parseFloat(cols[unitsIdx]);
          const avgNav = navIdx !== -1 ? parseFloat(cols[navIdx]) : 10;
          const folio = folioIdx !== -1 ? cols[folioIdx] : undefined;

          if ((!schemeName && !schemeCode) || isNaN(units) || units <= 0) continue;

          items.push({
            schemeName: schemeName || "Mutual Fund",
            schemeCode: schemeCode || undefined,
            units,
            avgNav: isNaN(avgNav) || avgNav <= 0 ? 10 : avgNav,
            folioNumber: folio,
          });
        }

        if (items.length === 0) throw new Error("No valid mutual fund holding rows found in CSV.");

        const res = await apiFetch<{ success: boolean; count: number }>("/api/mutual-funds/holdings/mine/csv", {
          method: "POST",
          body: JSON.stringify({ items }),
        });

        addToast({
          type: "success",
          title: "MF CSV Imported",
          message: `Successfully imported ${res.count || items.length} mutual funds!`,
        });
        setShowMfCsvModal(false);
        setMfCsvFile(null);
        fetchData();
      } catch (err) {
        alert(err instanceof Error ? err.message : "CSV Parse error");
      } finally {
        setUploadingMfCsv(false);
      }
    };
    reader.readAsText(file);
  };

  // Handle manual transaction recording
  const handleRecordTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formStock.trim() || !formQty || !formPrice) return;

    setSubmitting(true);
    try {
      await apiFetch("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          stock: formStock.toUpperCase().trim(),
          type: formType,
          quantity: parseFloat(formQty),
          price: parseFloat(formPrice),
          isVirtual: formIsVirtual,
        }),
      });

      addToast({
        type: formType === "BUY" ? "success" : "info",
        title: "Transaction Logged",
        message: `${formType} ${formQty} shares of ${formStock.toUpperCase()} recorded.`,
      });
      setFormStock("");
      setFormQty("");
      setFormPrice("");
      setFormIsVirtual(false);
      fetchData();
      // Notify TopNav
      window.dispatchEvent(new CustomEvent("wallet-update"));
    } catch (err) {
      addToast({
        type: "danger",
        title: "Failed",
        message: err instanceof Error ? err.message : "Transaction invalid.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCSVUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) throw new Error("Invalid CSV format");
        
        const headers = lines[0].toLowerCase().split(",");
        const symbolIdx = headers.findIndex((h) => h.includes("instrument") || h.includes("symbol") || h.includes("stock"));
        const qtyIdx = headers.findIndex((h) => h.includes("qty") || h.includes("quantity"));
        const priceIdx = headers.findIndex((h) => h.includes("avg") || h.includes("cost") || h.includes("price") || h.includes("buy"));
        
        if (symbolIdx === -1 || qtyIdx === -1 || priceIdx === -1) {
          throw new Error("CSV must contain columns: Instrument/Symbol, Quantity/Qty, and Avg. cost/Price");
        }

        const deviceId = localStorage.getItem("sp_device_id");
        if (!deviceId) return;

        let importCount = 0;
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",");
          if (cols.length <= Math.max(symbolIdx, qtyIdx, priceIdx)) continue;
          
          let sym = cols[symbolIdx].replace(/"/g, "").trim();
          if (!sym) continue;
          if (!sym.includes(".") && !["AAPL", "TSLA", "NVDA", "MSFT", "GOOG"].includes(sym)) {
            sym = `${sym}.NS`;
          }

          const qty = parseFloat(cols[qtyIdx].replace(/"/g, "").trim());
          const price = parseFloat(cols[priceIdx].replace(/"/g, "").trim());
          
          if (isNaN(qty) || isNaN(price) || qty <= 0 || price <= 0) continue;

          await apiFetch("/api/transactions", {
            method: "POST",
            body: JSON.stringify({
              stock: sym.toUpperCase(),
              type: "BUY",
              quantity: qty,
              price: price,
            }),
          });
          importCount++;
        }

        addToast({
          type: "success",
          title: "CSV Imported",
          message: `Successfully imported ${importCount} holdings from your Zerodha CSV file!`,
        });
        fetchData();
        window.dispatchEvent(new CustomEvent("wallet-update"));
      } catch (err) {
        alert(err instanceof Error ? err.message : "CSV Parse error");
      }
    };
    reader.readAsText(file);
  };

  const handleConnectBroker = async () => {
    if (connectingBroker) return;
    if (brokerSelect === "CSV") {
      if (!csvFile) {
        alert("Please select a CSV file to upload.");
        return;
      }
      setConnectingBroker(true);
      await handleCSVUpload(csvFile);
      setConnectingBroker(false);
      setCsvFile(null);
      return;
    }

    setConnectingBroker(true);
    try {
      if (brokerSelect === "DEMO") {
        const deviceId = localStorage.getItem("sp_device_id");
        if (!deviceId) return;

        // Seed mock holdings
        const mockTrades = [
          { stock: "TCS.NS", type: "BUY", quantity: 50, price: 3420 },
          { stock: "INFY.NS", type: "BUY", quantity: 100, price: 1450 },
          { stock: "AAPL", type: "BUY", quantity: 25, price: 182 },
          { stock: "NVDA", type: "BUY", quantity: 10, price: 850 },
        ];

        for (const trade of mockTrades) {
          await apiFetch("/api/transactions", {
            method: "POST",
            body: JSON.stringify(trade),
          });
        }

        // Also seed mock mutual funds for DEMO account
        const mockMfs = [
          { schemeCode: "122639", schemeName: "Parag Parikh Flexi Cap Fund - Direct Plan - Growth", units: 145.25, avgNav: 62.40, folioNumber: "10192834/56" },
          { schemeCode: "118834", schemeName: "Mirae Asset Large Cap Fund - Direct Plan - Growth", units: 210.50, avgNav: 94.80, folioNumber: "20938475/12" },
          { schemeCode: "120503", schemeName: "Nippon India Small Cap Fund - Direct Plan - Growth", units: 180.00, avgNav: 125.10, folioNumber: "31827465/99" },
        ];
        for (const mf of mockMfs) {
          await apiFetch("/api/mutual-funds/holdings/mine", {
            method: "POST",
            body: JSON.stringify(mf),
          }).catch(() => {});
        }

        addToast({
          type: "success",
          title: "Demat Connected",
          message: `Successfully connected client ID ${brokerUserId} and synced stocks & mutual funds!`,
        });
        
        // Reset broker inputs
        setBrokerUserId("");
        setBrokerPassword("");
        fetchData();
        window.dispatchEvent(new CustomEvent("wallet-update"));
      } else {
        // Redirect to OAuth
        try {
          const data = await apiFetch<{ authUrl?: string }>(`/api/brokers/${brokerSelect.toLowerCase()}/connect`);
          if (data.authUrl) {
            window.location.href = data.authUrl;
          }
        } catch (err) {
          addToast({
            type: "danger",
            title: "Connection Failed",
            message: err instanceof Error ? err.message : "Integration not active.",
          });
        }
      }
    } catch {
      addToast({ type: "danger", title: "Error", message: "Failed to connect Demat broker." });
    } finally {
      setConnectingBroker(false);
    }
  };

  // Group portfolio calculations by currency
  const getTotals = (curr: "INR" | "USD") => {
    let totalCost = 0;
    let totalValue = 0;
    holdings
      .filter((h) => h.currency === curr)
      .forEach((h) => {
        totalCost += h.cost;
        totalValue += h.value ?? 0;
      });
    const totalPL = totalValue - totalCost;
    const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;
    return { totalCost, totalValue, totalPL, totalPLPct };
  };

  const inrTotals = getTotals("INR");
  const usdTotals = getTotals("USD");

  const fmt = (val: number | undefined | null, currency: "INR" | "USD") => {
    if (val === undefined || val === null) return "—";
    const symbol = currency === "USD" ? "$" : "₹";
    return `${symbol}${val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="grid grid-rows-[auto_1fr_auto] min-h-[calc(100vh-32px)] pt-4">
      <main className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] max-w-[1600px] mx-auto w-full p-4 sm:p-6 lg:p-8 gap-6 lg:gap-8">

        <div className="xl:col-span-2 min-w-0">
          <PortfolioDoctor />
        </div>

        {/* Left Column: Active Positions */}
        <div className="min-w-0 flex flex-col gap-5">
          <section className="flex flex-col gap-5 mt-0">
            <div className="font-mono text-[0.62rem] tracking-[0.15em] text-text-3 uppercase">{"PORTFOLIO SUMMARY"}</div>
            
            {/* Wallet Cash Display Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-4">
              <div className="bg-bg-1 border border-border-custom p-6 rounded border-l-[3px] border-l-green-custom">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-mono text-[0.65rem] px-2 py-1 bg-green-dim text-green-custom rounded-sm">INR WALLET</span>
                  <span className="font-mono text-text-3 font-bold">₹</span>
                </div>
                <div className="font-mono text-[2rem] font-bold text-text-custom leading-none mb-2">{fmt(wallet.inr, "INR")}</div>
                <div className="flex gap-2 font-mono text-xs text-text-2 mt-2">
                  <span>Invested: {fmt(inrTotals.totalCost, "INR")}</span>
                  <span>·</span>
                  <span>Current: {fmt(inrTotals.totalValue, "INR")}</span>
                  {inrTotals.totalCost > 0 && (
                    <>
                      <span>·</span>
                      <span className={inrTotals.totalPL >= 0 ? "text-green-custom" : "text-red-custom"}>
                        {inrTotals.totalPL >= 0 ? "▲" : "▼"} {Math.abs(inrTotals.totalPLPct).toFixed(2)}%
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="bg-bg-1 border border-border-custom p-6 rounded border-l-[3px] border-l-cyan-custom">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-mono text-[0.65rem] px-2 py-1 bg-blue-dim text-blue-custom rounded-sm">USD WALLET</span>
                  <span className="font-mono text-text-3 font-bold">$</span>
                </div>
                <div className="font-mono text-[2rem] font-bold text-text-custom leading-none mb-2">{fmt(wallet.usd, "USD")}</div>
                <div className="flex gap-2 font-mono text-xs text-text-2 mt-2">
                  <span>Invested: {fmt(usdTotals.totalCost, "USD")}</span>
                  <span>·</span>
                  <span>Current: {fmt(usdTotals.totalValue, "USD")}</span>
                  {usdTotals.totalCost > 0 && (
                    <>
                      <span>·</span>
                      <span className={usdTotals.totalPL >= 0 ? "text-green-custom" : "text-red-custom"}>
                        {usdTotals.totalPL >= 0 ? "▲" : "▼"} {Math.abs(usdTotals.totalPLPct).toFixed(2)}%
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Asset Class Switcher */}
            <div className="flex border-b border-border-custom gap-2 mt-4">
              <button
                type="button"
                onClick={() => setActiveAssetTab("STOCKS")}
                className={`font-mono text-xs font-bold px-4 py-2.5 border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                  activeAssetTab === "STOCKS"
                    ? "border-green-custom text-green-custom bg-green-custom/10"
                    : "border-transparent text-text-3 hover:text-text-custom hover:bg-bg-2"
                }`}
              >
                <span>STOCKS &amp; ETFS</span>
                <span className={`text-[0.65rem] px-1.5 py-0.5 rounded ${activeAssetTab === "STOCKS" ? "bg-green-custom/20 text-green-custom" : "bg-bg-2 text-text-3"}`}>
                  {holdings.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveAssetTab("MUTUAL_FUNDS")}
                className={`font-mono text-xs font-bold px-4 py-2.5 border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                  activeAssetTab === "MUTUAL_FUNDS"
                    ? "border-green-custom text-green-custom bg-green-custom/10"
                    : "border-transparent text-text-3 hover:text-text-custom hover:bg-bg-2"
                }`}
              >
                <span>MUTUAL FUNDS</span>
                <span className={`text-[0.65rem] px-1.5 py-0.5 rounded ${activeAssetTab === "MUTUAL_FUNDS" ? "bg-green-custom/20 text-green-custom" : "bg-bg-2 text-text-3"}`}>
                  {mfHoldings.length}
                </span>
              </button>
            </div>

            {/* Holdings Tables by Asset Class */}
            {activeAssetTab === "STOCKS" && (() => {
              const inrTotalValue = holdings.filter(h => h.currency === "INR").reduce((sum, h) => sum + (h.value || 0), 0);
              const usdTotalValue = holdings.filter(h => h.currency === "USD").reduce((sum, h) => sum + (h.value || 0), 0);

              return (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 mt-6 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="font-mono text-[0.65rem] tracking-[0.15em] text-text-3 uppercase font-bold">
                        ACTIVE PORTFOLIO POSITIONS
                      </div>
                      <span className="font-mono text-[0.6rem] bg-bg-2 border border-border-custom px-2 py-0.5 rounded text-text-3">
                        {holdings.length} POSITIONS
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setAutoRefresh(prev => !prev)}
                        className={`flex items-center gap-1.5 font-mono text-[0.62rem] px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                          autoRefresh 
                            ? "bg-green-dim/15 border-green-custom/30 text-green-custom" 
                            : "bg-bg-2 border-border-custom text-text-3"
                        }`}
                        title="Toggle real-time auto sync every 30 seconds"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? "bg-green-custom animate-pulse" : "bg-text-4"}`} />
                        <span>{autoRefresh ? "LIVE SYNC (30s)" : "SYNC PAUSED"}</span>
                      </button>
                      <button
                        onClick={() => fetchData()}
                        disabled={loading}
                        className="font-mono text-[0.62rem] bg-bg-2 hover:bg-bg-3 border border-border-custom text-text-2 px-2.5 py-1 rounded transition-colors cursor-pointer"
                        title="Force Refresh Data"
                      >
                        ↻ REFRESH
                      </button>
                    </div>
                  </div>

                  {loading ? (
                    <div className="font-mono text-xs text-text-3 py-8 text-center bg-bg-1 border border-border-custom rounded my-2">
                      FETCHING CURRENT HOLDINGS &amp; SIGNALS...
                    </div>
                  ) : holdings.length === 0 ? (
                    <div className="bg-bg-1 border border-border-custom p-12 rounded text-center my-4">
                      <div className="font-display text-[1.5rem] tracking-[0.1em] text-text-3">PORTFOLIO EMPTY</div>
                      <div className="font-mono text-xs text-text-3 mt-2">LINK A DEMAT ACCOUNT OR RECORD A TRANSACTION TO SYNC STOCKS</div>
                    </div>
                  ) : (
                    <div className="w-full overflow-x-auto border border-border-custom bg-bg-1 rounded my-2">
                      <table className="w-full border-collapse text-left text-[0.8rem]">
                        <thead>
                          <tr className="border-b border-border-custom text-text-2 font-mono uppercase text-[0.62rem] tracking-wider bg-bg-2 whitespace-nowrap">
                            <th className="p-3">STOCK</th>
                            <th className="p-3">EXCHANGE</th>
                            <th className="p-3 text-right">WEIGHT</th>
                            <th className="p-3 text-right">QTY</th>
                            <th className="p-3 text-right">AVG PRICE</th>
                            <th className="p-3 text-right">LIVE PRICE</th>
                            <th className="p-3 text-right">TOTAL VALUE</th>
                            <th className="p-3 text-right">UNREALIZED P&amp;L</th>
                            <th className="p-3 text-right">STOP-LOSS</th>
                            <th className="p-3 text-center">TARGET RANGE</th>
                            <th className="p-3 text-center">AI SIGNAL</th>
                            <th className="p-3 text-center">ACTIONS</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono">
                          {holdings.map((h) => {
                            const normalize = (sym?: string) => (sym || "").toUpperCase().replace(/\.(NS|BO)$/, "").trim();
                            const holdingSym = normalize(h.displaySym || h.stock);
                            const sig = aiSignals.find(s => 
                              normalize(s.symbol) === holdingSym || 
                              normalize(s.displaySymbol) === holdingSym ||
                              normalize(s.providerSymbol) === holdingSym
                            );
                            const action = sig ? (sig.action || sig.signal || "HOLD").toUpperCase() : null;
                            const sigScore = sig?.finalScore ?? sig?.score ?? 50;
                            const totalBase = h.currency === "USD" ? usdTotalValue : inrTotalValue;
                            const weightPct = totalBase > 0 ? ((h.value || 0) / totalBase) * 100 : 0;
                            const isOverConcentrated = weightPct > 25;
                            const currSym = h.currency === "USD" ? "$" : "₹";
                            const isStopLossBreached = sig?.stopLoss && h.currentPrice && h.currentPrice <= sig.stopLoss;
                            const guidance = action ? getPositionGuidance(action, sigScore, weightPct) : null;

                            return (
                              <tr key={h.id} className="border-b border-border-custom hover:bg-bg-2/50 transition-colors duration-150 whitespace-nowrap">
                                <td className="p-3 font-bold text-text-custom">
                                  <span 
                                    className="cursor-pointer hover:text-cyan-custom transition-colors"
                                    onClick={() => {
                                      setSelectedModalHolding(h);
                                      setSelectedModalSignal(sig || null);
                                      setSelectedModalWeight(weightPct);
                                    }}
                                  >
                                    {h.displaySym}
                                  </span>
                                </td>
                                <td className="p-3 text-text-3 text-[0.7rem]">{h.exchange}</td>
                                <td className="p-3 text-right">
                                  <span className={`text-[0.72rem] ${isOverConcentrated ? "text-amber-custom font-bold" : "text-text-2"}`}>
                                    {weightPct.toFixed(1)}% {isOverConcentrated && <WarningIcon />}
                                  </span>
                                </td>
                                <td className="p-3 text-right text-text-custom">{h.quantity.toLocaleString()}</td>
                                <td className="p-3 text-right text-text-custom">{fmt(h.avgPrice, h.currency)}</td>
                                <td className="p-3 text-right text-cyan-custom font-bold">{fmt(h.currentPrice, h.currency)}</td>
                                <td className="p-3 text-right text-text-custom">{fmt(h.value, h.currency)}</td>
                                <td className={`p-3 text-right font-bold ${h.pl != null ? (h.pl >= 0 ? "text-green-custom" : "text-red-custom") : "text-text-4"}`}>
                                  {h.pl != null
                                    ? `${h.pl >= 0 ? "+" : ""}${h.pl.toFixed(2)}${h.plPct != null ? ` (${h.plPct >= 0 ? "+" : ""}${h.plPct.toFixed(2)}%)` : ""}`
                                    : "—"}
                                </td>
                                <td className="p-3 text-right font-mono text-[0.75rem]">
                                  {sig?.stopLoss ? (
                                    <span className={isStopLossBreached ? "text-red-custom font-bold animate-pulse" : "text-red-custom/80"}>
                                      {currSym}{sig.stopLoss.toFixed(2)} {isStopLossBreached && <WarningIcon />}
                                    </span>
                                  ) : (
                                    <span className="text-text-4">—</span>
                                  )}
                                </td>
                                <td className="p-3 text-center font-mono text-[0.75rem]">
                                  {sig?.targetRange ? (
                                    <span className="text-green-custom font-bold">
                                      {currSym}{sig.targetRange.min} - {currSym}{sig.targetRange.max}
                                    </span>
                                  ) : (
                                    <span className="text-text-4">—</span>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  {action ? (
                                    <div className="flex flex-col items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedModalHolding(h);
                                          setSelectedModalSignal(sig || null);
                                          setSelectedModalWeight(weightPct);
                                        }}
                                        className={`inline-flex items-center gap-1 font-mono text-[0.65rem] font-bold px-2 py-0.5 border rounded uppercase cursor-pointer transition-transform hover:scale-105 ${
                                          action.includes("BUY") ? "bg-green-dim/20 border-green-custom/40 text-green-custom hover:border-green-custom" :
                                          (action.includes("SELL") || action === "REDUCE") ? "bg-red-dim/20 border-red-custom/40 text-red-custom hover:border-red-custom" :
                                          action === "HOLD" ? "bg-blue-custom/15 border-blue-custom/40 text-blue-custom hover:border-blue-custom" :
                                          "bg-amber-custom/15 border-amber-custom/40 text-amber-custom hover:border-amber-custom"
                                        }`}
                                        title="Click to view 7-pillar breakdown & analysis"
                                      >
                                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                                          action.includes("BUY") ? "bg-green-custom" :
                                          (action.includes("SELL") || action === "REDUCE") ? "bg-red-custom" :
                                          action === "HOLD" ? "bg-blue-custom" : "bg-amber-custom"
                                        }`} />
                                        <span>{action}</span>
                                        <svg className="w-2.5 h-2.5 text-text-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m1.7-5.3a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                      </button>
                                      {guidance && (
                                        <span className="font-mono text-[0.6rem] text-red-custom font-bold">
                                          {guidance.label === "Exit Position" ? "Exit 100%" : `Trim ${guidance.pct}%`}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="font-mono text-[0.65rem] text-text-4 uppercase">No Signal</span>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  <button
                                    onClick={() => handleDeletePosition(h.stock)}
                                    className="font-mono text-[0.65rem] bg-transparent border border-red-custom text-red-custom py-1 px-2 rounded cursor-pointer transition-colors duration-150 hover:bg-red-dim hover:text-red-custom"
                                  >
                                    RESET
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              );
            })()}

            {/* MUTUAL FUNDS VIEW */}
            {activeAssetTab === "MUTUAL_FUNDS" && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 mt-6 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="font-mono text-[0.65rem] tracking-[0.15em] text-text-3 uppercase font-bold">
                      OWNED MUTUAL FUND PORTFOLIO
                    </div>
                    <span className="font-mono text-[0.6rem] bg-bg-2 border border-border-custom px-2 py-0.5 rounded text-text-3">
                      {mfHoldings.length} SCHEMES
                    </span>
                    <span className="font-mono text-[0.58rem] bg-cyan-custom/10 text-cyan-custom border border-cyan-custom/30 px-2 py-0.5 rounded">
                      AMFI LIVE NAV
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddMfModal(true)}
                      className="font-mono text-[0.65rem] font-bold px-3 py-1.5 bg-green-custom text-bg rounded cursor-pointer hover:opacity-90 transition-opacity flex items-center gap-1"
                    >
                      <span>+ ADD FUND</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowMfCsvModal(true)}
                      className="font-mono text-[0.65rem] px-3 py-1.5 bg-bg-2 border border-border-custom text-text-2 hover:text-text-custom rounded cursor-pointer transition-colors"
                    >
                      IMPORT MF CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => fetchData()}
                      className="font-mono text-[0.65rem] px-2.5 py-1.5 bg-bg-2 border border-border-custom text-text-3 hover:text-text-custom rounded cursor-pointer transition-colors"
                      title="Refresh NAVs"
                    >
                      REFRESH
                    </button>
                  </div>
                </div>

                {/* Mutual Fund Summary Metric Cards */}
                {mfSummary && mfHoldings.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                    <div className="bg-bg-1 border border-border-custom p-4 rounded">
                      <div className="font-mono text-[0.58rem] tracking-[0.1em] text-text-3 uppercase">TOTAL INVESTED</div>
                      <div className="font-mono text-lg font-bold text-text-custom mt-1">
                        ₹{mfSummary.totalInvested.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="bg-bg-1 border border-border-custom p-4 rounded">
                      <div className="font-mono text-[0.58rem] tracking-[0.1em] text-text-3 uppercase">CURRENT VALUE</div>
                      <div className="font-mono text-lg font-bold text-cyan-custom mt-1">
                        ₹{mfSummary.totalValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="bg-bg-1 border border-border-custom p-4 rounded">
                      <div className="font-mono text-[0.58rem] tracking-[0.1em] text-text-3 uppercase">TOTAL RETURNS</div>
                      <div className={`font-mono text-lg font-bold mt-1 ${mfSummary.totalPl >= 0 ? "text-green-custom" : "text-red-custom"}`}>
                        {mfSummary.totalPl >= 0 ? "+" : ""}₹{mfSummary.totalPl.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        <span className="text-xs ml-1.5 font-normal">
                          ({mfSummary.totalPl >= 0 ? "+" : ""}{mfSummary.totalPlPct.toFixed(2)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {loading ? (
                  <div className="font-mono text-xs text-text-3 py-8 text-center bg-bg-1 border border-border-custom rounded">
                    FETCHING AMFI LIVE NAVS...
                  </div>
                ) : mfHoldings.length === 0 ? (
                  <div className="border border-dashed border-border-custom bg-bg-1/40 p-10 text-center rounded flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-green-custom/10 flex items-center justify-center text-green-custom text-xl">
                      📊
                    </div>
                    <div className="font-display text-base text-text-custom">NO MUTUAL FUNDS RECORDED</div>
                    <p className="font-mono text-xs text-text-3 max-w-md leading-relaxed">
                      Track your mutual fund portfolio with live daily NAV updates from AMFI. Add your holdings manually, sync via Zerodha Kite, or import your CAS statement.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => setShowAddMfModal(true)}
                        className="font-mono text-xs font-bold px-4 py-2 bg-green-custom text-bg rounded cursor-pointer hover:opacity-90"
                      >
                        + ADD MUTUAL FUND
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowMfCsvModal(true)}
                        className="font-mono text-xs px-4 py-2 bg-bg-2 border border-border-custom text-text-custom rounded cursor-pointer hover:bg-bg-3"
                      >
                        IMPORT CAS / COIN CSV
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-border-custom bg-bg-1 rounded">
                    <table className="w-full text-left border-collapse text-xs font-mono">
                      <thead>
                        <tr className="border-b border-border-custom bg-bg-2 text-[0.62rem] text-text-3 tracking-[0.08em] uppercase">
                          <th className="p-3">SCHEME NAME</th>
                          <th className="p-3">FOLIO</th>
                          <th className="p-3 text-right">UNITS</th>
                          <th className="p-3 text-right">AVG NAV</th>
                          <th className="p-3 text-right">CURRENT NAV</th>
                          <th className="p-3 text-right">INVESTED</th>
                          <th className="p-3 text-right">CURRENT VALUE</th>
                          <th className="p-3 text-right">OVERALL P&amp;L</th>
                          <th className="p-3 text-center">SOURCE</th>
                          <th className="p-3 text-center">ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mfHoldings.map((mf) => (
                          <tr key={mf.id} className="border-b border-border-custom hover:bg-bg-2/50 transition-colors whitespace-nowrap">
                            <td className="p-3">
                              <div className="font-bold text-text-custom max-w-[280px] truncate" title={mf.schemeName}>
                                {mf.schemeName}
                              </div>
                              <div className="flex items-center gap-1.5 text-[0.62rem] text-text-3 mt-0.5">
                                {mf.category && (
                                  <span className="bg-bg-2 px-1 rounded text-text-3">{mf.category}</span>
                                )}
                                <span>AMFI: {mf.schemeCode}</span>
                              </div>
                            </td>
                            <td className="p-3 text-text-3 text-[0.7rem]">{mf.folioNumber || "—"}</td>
                            <td className="p-3 text-right text-text-custom font-bold">{mf.units.toFixed(3)}</td>
                            <td className="p-3 text-right text-text-custom">₹{mf.avgNav.toFixed(2)}</td>
                            <td className="p-3 text-right text-cyan-custom font-bold">
                              ₹{mf.currentNav.toFixed(2)}
                              {mf.navDate && (
                                <div className="text-[0.55rem] text-text-3 font-normal">{mf.navDate}</div>
                              )}
                            </td>
                            <td className="p-3 text-right text-text-custom">₹{mf.invested.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                            <td className="p-3 text-right text-text-custom font-bold">₹{mf.currentValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                            <td className={`p-3 text-right font-bold ${mf.pl >= 0 ? "text-green-custom" : "text-red-custom"}`}>
                              {mf.pl >= 0 ? "+" : ""}₹{mf.pl.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                              <div className="text-[0.6rem] font-normal">
                                ({mf.pl >= 0 ? "+" : ""}{mf.plPct.toFixed(2)}%)
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-bg-2 border border-border-custom text-text-3">
                                {mf.source}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <a
                                  href={`/mutual-funds`}
                                  className="text-[0.62rem] font-mono px-2 py-0.5 border border-border-custom text-text-2 hover:text-green-custom rounded hover:border-green-custom transition-colors"
                                  title="Explore in Mutual Funds"
                                >
                                  EXPLORE
                                </a>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMf(mf.id, mf.schemeName)}
                                  className="text-[0.62rem] font-mono px-2 py-0.5 border border-red-custom/40 text-red-custom hover:bg-red-custom/10 rounded cursor-pointer transition-colors"
                                  title="Remove from portfolio"
                                >
                                  RESET
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        {/* Right Column: Record Form & Tx Feed */}
        <div className="flex flex-col gap-6">
          {brokerConnections.some(c => c.status === "CONNECTED") ? (
            brokerConnections.filter(c => c.status === "CONNECTED").map((conn) => {
              const brokerId = conn.broker;
              const isZerodha = brokerId === "ZERODHA";
              const title = isZerodha ? "ZERODHA KITE CONNECTION" : "UPSTOX CONNECTION";
              const syncBtnLabel = isZerodha ? "SYNC ZERODHA" : "SYNC UPSTOX";
              const disconnectConfirm = isZerodha 
                ? "Are you sure you want to disconnect Zerodha? This will stop automatic synchronization."
                : "Are you sure you want to disconnect Upstox? This will stop automatic synchronization.";
              const syncToastSuccess = isZerodha
                ? "Successfully synced Zerodha holdings!"
                : "Successfully synced Upstox holdings!";
              const disconnectToastSuccess = isZerodha
                ? "Zerodha disconnected successfully."
                : "Upstox disconnected successfully.";

              return (
                <section key={conn.id} className="bg-bg-1 border border-border-custom p-6 rounded flex flex-col gap-4 mb-4">
                  <div className="font-mono text-[0.62rem] tracking-[0.15em] text-text-3 uppercase">{title}</div>
                  
                  <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-center border-b border-border-custom pb-2.5">
                      <span className="font-mono text-[0.65rem] text-text-3 uppercase">Status</span>
                      <span className={`font-mono text-xs font-bold uppercase ${
                        syncingBroker === brokerId 
                          ? "text-blue-custom animate-pulse" 
                          : conn.status === "CONNECTED" 
                            ? "text-green-custom" 
                            : "text-red-custom"
                      }`}>
                        {syncingBroker === brokerId ? "Syncing" : "Connected"}
                      </span>
                    </div>

                    <div className="flex justify-between items-center border-b border-border-custom pb-2.5">
                      <span className="font-mono text-[0.65rem] text-text-3 uppercase">Last Synced</span>
                      <span className="font-mono text-xs text-text-custom">
                        {conn.lastSyncAt 
                          ? new Date(conn.lastSyncAt).toLocaleString("en-US", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                              hour12: true
                            })
                          : "NEVER"}
                      </span>
                    </div>

                    {conn.lastError && (
                      <div className="p-3 border border-red-custom bg-red-dim font-mono text-[0.58rem] text-red-custom leading-relaxed">
                        Last Error: {conn.lastError}
                      </div>
                    )}

                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={async () => {
                          setSyncingBroker(brokerId);
                          try {
                            await apiFetch(`/api/brokers/${brokerId}/sync`, {
                              method: "POST",
                            });
                            addToast({ type: "success", title: "Broker Synced", message: syncToastSuccess });
                            fetchData();
                          } catch (err) {
                            addToast({
                              type: "danger",
                              title: "Sync Failed",
                              message: err instanceof Error ? err.message : "Failed to sync.",
                            });
                          } finally {
                            setSyncingBroker(null);
                          }
                        }}
                        disabled={syncingBroker === brokerId}
                        className="flex-1 bg-green-custom hover:bg-green-custom/90 text-bg font-mono text-xs font-bold py-2.5 rounded cursor-pointer uppercase transition-opacity duration-150 disabled:opacity-50 text-center border-none"
                      >
                        {syncingBroker === brokerId ? "SYNCING..." : syncBtnLabel}
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm(disconnectConfirm)) return;
                          try {
                            await apiFetch(`/api/brokers/${brokerId}`, {
                              method: "DELETE",
                            });
                            addToast({ type: "success", title: "Disconnected", message: disconnectToastSuccess });
                            fetchData();
                          } catch (err) {
                            addToast({
                              type: "danger",
                              title: "Error",
                              message: err instanceof Error ? err.message : "Failed to disconnect.",
                            });
                          }
                        }}
                        className="flex-1 bg-transparent hover:bg-red-dim/10 border border-red-custom/40 hover:border-red-custom text-red-custom font-mono text-xs font-bold py-2.5 rounded cursor-pointer uppercase transition-colors duration-150 text-center"
                      >
                        DISCONNECT
                      </button>
                    </div>
                  </div>
                </section>
              );
            })
          ) : (
            <section className="bg-bg-1 border border-border-custom p-6 rounded flex flex-col gap-4">
              <div className="font-mono text-[0.62rem] tracking-[0.15em] text-text-3 uppercase">{"LINK DEMAT / BROKER ACCOUNT"}</div>
              
              <div className="flex flex-col gap-3">
                <p className="text-[0.68rem] text-text-2 leading-relaxed">
                  Connect your active Zerodha, Upstox, or Simulated Demat account to sync holdings instantly.
                </p>

                <div>
                  <label className="block font-mono text-[0.55rem] text-text-3 mb-1 uppercase">SELECT BROKER</label>
                  <select
                    value={brokerSelect}
                    onChange={(e) => setBrokerSelect(e.target.value)}
                    className="w-full bg-bg border border-border-custom rounded p-2 text-text-custom font-mono text-xs outline-none focus:border-green-custom"
                  >
                    <option value="DEMO">Demo / Simulation Broker</option>
                    <option value="CSV">Upload Zerodha Console CSV (Free)</option>
                    <option value="ZERODHA">Zerodha Kite (OAuth)</option>
                    <option value="UPSTOX">Upstox (OAuth)</option>
                  </select>
                </div>

                {brokerSelect === "CSV" && (
                  <div>
                    <label className="block font-mono text-[0.55rem] text-text-3 mb-1 uppercase">SELECT ZERODHA HOLDINGS CSV</label>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                      className="w-full bg-bg border border-border-custom rounded p-2 text-text-custom font-mono text-xs outline-none focus:border-green-custom"
                    />
                    <span className="text-[0.58rem] text-text-3 font-mono block mt-1">
                      *Go to Zerodha Console &gt; Holdings &gt; click "Download XLSX/CSV" to get this file.
                    </span>
                  </div>
                )}

                {brokerSelect === "DEMO" && (
                  <>
                    <div>
                      <label className="block font-mono text-[0.55rem] text-text-3 mb-1 uppercase">CLIENT USER ID</label>
                      <input
                        type="text"
                        placeholder="e.g. AB1234"
                        value={brokerUserId}
                        onChange={(e) => setBrokerUserId(e.target.value)}
                        className="w-full bg-bg border border-border-custom rounded p-2 text-text-custom font-mono text-xs outline-none focus:border-green-custom"
                      />
                    </div>
                    <div>
                      <label className="block font-mono text-[0.55rem] text-text-3 mb-1 uppercase">PASSWORD / PIN</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={brokerPassword}
                        onChange={(e) => setBrokerPassword(e.target.value)}
                        className="w-full bg-bg border border-border-custom rounded p-2 text-text-custom font-mono text-xs outline-none focus:border-green-custom"
                      />
                    </div>
                  </>
                )}

                {brokerSelect !== "DEMO" && brokerSelect !== "CSV" && (
                  <div className="p-3 border border-border-custom bg-bg-2 font-mono text-[0.58rem] text-text-3 leading-relaxed">
                    Notice: OAuth connection is active. Redirects to broker login page safely without sharing credentials.
                  </div>
                )}

                <button
                  onClick={handleConnectBroker}
                  disabled={connectingBroker || (brokerSelect === "DEMO" && (!brokerUserId.trim() || !brokerPassword.trim()))}
                  className="w-full font-mono text-xs font-bold text-bg border-none p-3 rounded cursor-pointer tracking-wider uppercase transition-colors duration-150 bg-green-custom hover:bg-green-custom/90 disabled:opacity-40"
                >
                  {connectingBroker ? "CONNECTING..." : "CONNECT & SYNC DEMAT HOLDINGS →"}
                </button>
              </div>
            </section>
          )}
          <section className="bg-bg-1 border border-border-custom p-6 rounded flex flex-col gap-5">
            <div className="font-mono text-[0.62rem] tracking-[0.15em] text-text-3 uppercase">{"RECORD MANUAL TRANSACTION"}</div>
            <form onSubmit={handleRecordTransaction} className="mt-4">
              <div className="mb-4">
                <label className="block font-mono text-[0.65rem] text-text-3 mb-1">SYMBOL (e.g. INFY.NS or TSLA)</label>
                <input
                  type="text"
                  placeholder="SYMBOL"
                  value={formStock}
                  onChange={(e) => setFormStock(e.target.value)}
                  className="w-full bg-bg border border-border-custom rounded p-2 text-text-custom font-mono text-xs outline-none focus:border-green-custom"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4">
                <div>
                  <label className="block font-mono text-[0.65rem] text-text-3 mb-1">ORDER TYPE</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as "BUY" | "SELL")}
                    className="w-full bg-bg border border-border-custom rounded p-2 text-text-custom font-mono text-xs outline-none focus:border-green-custom"
                  >
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                </div>

                <div>
                  <label className="block font-mono text-[0.65rem] text-text-3 mb-1">QUANTITY</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="QTY"
                    value={formQty}
                    onChange={(e) => setFormQty(e.target.value)}
                    className="w-full bg-bg border border-border-custom rounded p-2 text-text-custom font-mono text-xs outline-none focus:border-green-custom"
                    required
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block font-mono text-[0.65rem] text-text-3 mb-1">PRICE PER SHARE</label>
                <input
                  type="number"
                  step="any"
                  placeholder="PRICE"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  className="w-full bg-bg border border-border-custom rounded p-2 text-text-custom font-mono text-xs outline-none focus:border-green-custom"
                  required
                />
              </div>

              <div className="mb-6 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="formIsVirtual"
                  checked={formIsVirtual}
                  onChange={(e) => setFormIsVirtual(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-border-custom bg-bg accent-green-custom cursor-pointer"
                />
                <label htmlFor="formIsVirtual" className="font-mono text-[0.65rem] text-text-2 cursor-pointer select-none">
                  Virtual Portfolio (External Platform — Don't deduct from wallet)
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className={`w-full font-mono text-xs font-bold text-bg border-none p-3 rounded cursor-pointer tracking-wider uppercase transition-colors duration-150 disabled:opacity-40 ${
                  formType === "BUY" ? "bg-green-custom hover:bg-green-custom/90" : "bg-blue-custom hover:bg-blue-custom/90"
                }`}
              >
                {submitting ? "LOGGING TRANSACTION..." : `EXECUTE MANUAL ${formType} →`}
              </button>
            </form>
          </section>

          {/* Historical Log Feed */}
          <div className="font-mono text-[0.62rem] tracking-[0.15em] text-text-3 uppercase mt-8">{"HISTORICAL TRANSACTION LOG"}</div>
          {loading ? (
            <div className="font-mono text-xs text-text-3 py-4">LOADING HISTORY...</div>
          ) : transactions.length === 0 ? (
            <div className="border border-dashed border-border-custom p-6 text-center rounded mt-2">
              <div className="font-mono text-xs text-text-3">NO LOGGED TRANSACTIONS</div>
            </div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto border border-border-custom bg-bg-1 rounded mt-2 p-2">
              {transactions.map((tx) => {
                const currency = !tx.stock.endsWith(".NS") && !tx.stock.endsWith(".BO") ? "USD" : "INR";
                return (
                  <div
                    key={tx.id}
                    className="border-b border-border-custom p-2 text-xs font-mono flex justify-between items-center last:border-b-0"
                  >
                    <div>
                      <span className={`font-bold mr-2 ${tx.type === "BUY" ? "text-green-custom" : "text-blue-custom"}`}>{tx.type}</span>
                      <span className="text-text-custom font-bold">{tx.stock.replace(/^\^/, "").replace(/\.(NS|BO)$/, "")}</span>
                      <div className="text-text-3 text-[0.6rem] mt-[0.1rem]">
                        {new Date(tx.createdAt).toLocaleString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })} · {new Date(tx.createdAt).toLocaleDateString("en-IN")}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-text-custom">{tx.quantity} shares</span>
                      <div className="text-text-2">{fmt(tx.price, currency)} / share</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </main>

      {/* ── Footer ── */}
      <footer className="flex items-center justify-between p-[0.75rem_2rem] border-t border-border-custom bg-bg-1">
        <div className="font-mono text-[0.62rem] text-text-3 tracking-[0.05em]">
          BULLHAWK · DATABASE STORAGE LOGS ACTIVE · SECURE LOCAL PERSISTENCE
        </div>
        <div className="flex items-center gap-3 font-mono text-[0.6rem] text-text-4">
          <span>© 2026</span>
        </div>
      </footer>

      {/* Add Mutual Fund Modal */}
      {showAddMfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm p-4">
          <div className="bg-bg-1 border border-border-custom rounded-lg max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 relative">
            <div className="flex justify-between items-center border-b border-border-custom pb-3">
              <div>
                <h3 className="font-display text-lg text-text-custom">RECORD MUTUAL FUND HOLDING</h3>
                <p className="font-mono text-[0.62rem] text-text-3 mt-0.5">Search any Indian AMFI mutual fund and record your units.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddMfModal(false);
                  setSelectedMfScheme(null);
                  setMfSearchQuery("");
                  setMfSearchResults([]);
                }}
                className="text-text-3 hover:text-text-custom text-lg px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMf} className="flex flex-col gap-4">
              {/* Scheme Search */}
              <div className="relative">
                <label className="block font-mono text-[0.6rem] text-text-3 uppercase mb-1">
                  AMFI SCHEME SEARCH <span className="text-red-custom">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={mfSearchQuery}
                    onChange={(e) => handleMfSearch(e.target.value)}
                    placeholder="Search e.g. Parag Parikh, SBI Small Cap, HDFC..."
                    className="flex-1 bg-bg-2 border border-border-custom rounded p-2.5 text-xs font-mono text-text-custom outline-none focus:border-green-custom"
                    required
                  />
                  {mfSearching && (
                    <span className="font-mono text-xs text-text-3 self-center animate-pulse">Searching...</span>
                  )}
                </div>

                {/* Search Results Dropdown */}
                {mfSearchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto bg-bg border border-border-custom rounded shadow-xl divide-y divide-border-custom">
                    {mfSearchResults.map((res) => (
                      <button
                        type="button"
                        key={res.schemeCode}
                        onClick={() => handleSelectScheme(res)}
                        className="w-full text-left p-2.5 text-xs font-mono text-text-2 hover:bg-bg-2 hover:text-green-custom transition-colors cursor-pointer"
                      >
                        <div className="font-bold text-text-custom">{res.schemeName}</div>
                        <div className="text-[0.6rem] text-text-3">Code: {res.schemeCode}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedMfScheme && (
                <div className="p-2.5 rounded bg-green-custom/10 border border-green-custom/30 text-xs font-mono text-green-custom">
                  ✓ Selected: <span className="font-bold">{selectedMfScheme.schemeName}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[0.6rem] text-text-3 uppercase mb-1">
                    UNITS HELD <span className="text-red-custom">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={mfUnits}
                    onChange={(e) => setMfUnits(e.target.value)}
                    placeholder="e.g. 150.254"
                    className="w-full bg-bg-2 border border-border-custom rounded p-2.5 text-xs font-mono text-text-custom outline-none focus:border-green-custom"
                    required
                  />
                </div>

                <div>
                  <label className="block font-mono text-[0.6rem] text-text-3 uppercase mb-1">
                    AVG PURCHASE NAV (₹) <span className="text-red-custom">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={mfAvgNav}
                    onChange={(e) => setMfAvgNav(e.target.value)}
                    placeholder="e.g. 62.45"
                    className="w-full bg-bg-2 border border-border-custom rounded p-2.5 text-xs font-mono text-text-custom outline-none focus:border-green-custom"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-mono text-[0.6rem] text-text-3 uppercase mb-1">
                  FOLIO NUMBER (OPTIONAL)
                </label>
                <input
                  type="text"
                  value={mfFolio}
                  onChange={(e) => setMfFolio(e.target.value)}
                  placeholder="e.g. 10293847/56"
                  className="w-full bg-bg-2 border border-border-custom rounded p-2.5 text-xs font-mono text-text-custom outline-none focus:border-green-custom"
                />
              </div>

              {/* Total Investment preview */}
              {parseFloat(mfUnits) > 0 && parseFloat(mfAvgNav) > 0 && (
                <div className="p-3 bg-bg-2 border border-border-custom rounded flex justify-between items-center text-xs font-mono">
                  <span className="text-text-3">Estimated Invested Cost:</span>
                  <span className="text-text-custom font-bold">
                    ₹{(parseFloat(mfUnits) * parseFloat(mfAvgNav)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              <div className="flex gap-3 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMfModal(false);
                    setSelectedMfScheme(null);
                    setMfSearchQuery("");
                  }}
                  className="font-mono text-xs px-4 py-2 border border-border-custom text-text-3 hover:text-text-custom rounded cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={savingMf || !selectedMfScheme}
                  className="font-mono text-xs font-bold px-5 py-2 bg-green-custom text-bg rounded cursor-pointer hover:opacity-90 disabled:opacity-50"
                >
                  {savingMf ? "SAVING..." : "SAVE HOLDING"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import MF CSV Modal */}
      {showMfCsvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm p-4">
          <div className="bg-bg-1 border border-border-custom rounded-lg max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 relative">
            <div className="flex justify-between items-center border-b border-border-custom pb-3">
              <div>
                <h3 className="font-display text-lg text-text-custom">IMPORT MUTUAL FUNDS CSV</h3>
                <p className="font-mono text-[0.62rem] text-text-3 mt-0.5">Upload Zerodha Coin statement or CAMS / KFintech CAS export.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowMfCsvModal(false);
                  setMfCsvFile(null);
                }}
                className="text-text-3 hover:text-text-custom text-lg px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="p-3 bg-bg-2 border border-border-custom rounded text-[0.68rem] text-text-2 font-mono leading-relaxed">
                Expected CSV columns (any standard casing):<br />
                • <strong className="text-text-custom">Scheme / Fund Name</strong> (or AMFI Code)<br />
                • <strong className="text-text-custom">Units / Quantity</strong><br />
                • <strong className="text-text-custom">Avg NAV / Purchase Price</strong><br />
                • <strong className="text-text-custom">Folio No</strong> (optional)
              </div>

              <div>
                <label className="block font-mono text-[0.6rem] text-text-3 uppercase mb-1">
                  SELECT CSV FILE
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setMfCsvFile(e.target.files?.[0] || null)}
                  className="w-full bg-bg-2 border border-border-custom rounded p-2.5 text-xs font-mono text-text-custom outline-none focus:border-green-custom"
                />
              </div>

              <div className="flex gap-3 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowMfCsvModal(false);
                    setMfCsvFile(null);
                  }}
                  className="font-mono text-xs px-4 py-2 border border-border-custom text-text-3 hover:text-text-custom rounded cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  disabled={uploadingMfCsv || !mfCsvFile}
                  onClick={() => mfCsvFile && handleMfCsvSubmit(mfCsvFile)}
                  className="font-mono text-xs font-bold px-5 py-2 bg-green-custom text-bg rounded cursor-pointer hover:opacity-90 disabled:opacity-50"
                >
                  {uploadingMfCsv ? "PARSING & IMPORTING..." : "IMPORT HOLDINGS"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signal Detail Modal */}
      <SignalDetailModal
        isOpen={Boolean(selectedModalHolding)}
        onClose={() => {
          setSelectedModalHolding(null);
          setSelectedModalSignal(null);
        }}
        holding={selectedModalHolding}
        signal={selectedModalSignal}
        portfolioWeightPct={selectedModalWeight}
      />

      {/* Toasts */}
      <NotificationSystem toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}
