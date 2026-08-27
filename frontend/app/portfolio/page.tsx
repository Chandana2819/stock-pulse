"use client";

import { useEffect, useState, useCallback } from "react";
import NotificationSystem, { Toast } from "../components/NotificationSystem";
import PortfolioDoctor from "../components/PortfolioDoctor";
import { API_BASE } from "../lib/api";

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
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [wallet, setWallet] = useState<{ inr: number; usd: number }>({ inr: 0, usd: 0 });
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

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
    const deviceId = localStorage.getItem("sp_device_id");
    if (!deviceId) return;
    setLoading(true);
    try {
      // 1. Fetch Holdings & Wallet
      const holdRes = await fetch(`${API_BASE}/api/portfolio`, {
        headers: { "x-device-id": deviceId },
      });
      if (holdRes.ok) {
        const holdData = await holdRes.json();
        setHoldings(holdData.holdings || []);
        setWallet(holdData.user || { inr: 0, usd: 0 });
      }

      // 2. Fetch Transactions
      const txRes = await fetch(`${API_BASE}/api/transactions`, {
        headers: { "x-device-id": deviceId },
      });
      if (txRes.ok) {
        const txData = await txRes.json();
        setTransactions(Array.isArray(txData) ? txData : txData?.items ?? []);
      }

      // 3. Fetch Broker Connections
      const brokerRes = await fetch(`${API_BASE}/api/brokers`, {
        headers: { "x-device-id": deviceId },
      });
      if (brokerRes.ok) {
        const brokerData = await brokerRes.json();
        setBrokerConnections(brokerData.connections || []);
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

  // Handle Position Deletion
  const handleDeletePosition = async (stock: string) => {
    if (!confirm(`Are you sure you want to force-delete the position in ${stock}? This will wipe out the holding record.`)) return;

    const deviceId = localStorage.getItem("sp_device_id");
    if (!deviceId) return;

    try {
      const res = await fetch(`${API_BASE}/api/portfolio?stock=${stock}`, {
        method: "DELETE",
        headers: { "x-device-id": deviceId },
      });

      if (res.ok) {
        addToast({ type: "success", title: "Position Deleted", message: `Successfully wiped ${stock} holding.` });
        fetchData();
        window.dispatchEvent(new CustomEvent("wallet-update"));
      } else {
        const err = await res.json();
        addToast({ type: "danger", title: "Deletion Failed", message: err.error || "Wipe failed." });
      }
    } catch {
      addToast({ type: "danger", title: "Error", message: "Network error wiping position." });
    }
  };

  // Handle manual transaction recording
  const handleRecordTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formStock.trim() || !formQty || !formPrice) return;

    const deviceId = localStorage.getItem("sp_device_id");
    if (!deviceId) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
        },
        body: JSON.stringify({
          stock: formStock.toUpperCase().trim(),
          type: formType,
          quantity: parseFloat(formQty),
          price: parseFloat(formPrice),
          isVirtual: formIsVirtual,
        }),
      });

      const data = await res.json();
      if (res.ok) {
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
      } else {
        addToast({ type: "danger", title: "Failed", message: data.error || "Transaction invalid." });
      }
    } catch {
      addToast({ type: "danger", title: "Error", message: "Network error recording transaction." });
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

          await fetch(`${API_BASE}/api/transactions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-device-id": deviceId,
            },
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
          await fetch(`${API_BASE}/api/transactions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-device-id": deviceId,
            },
            body: JSON.stringify(trade),
          });
        }

        addToast({
          type: "success",
          title: "Demat Connected",
          message: `Successfully connected client ID ${brokerUserId} and synced holdings!`,
        });
        
        // Reset broker inputs
        setBrokerUserId("");
        setBrokerPassword("");
        fetchData();
        window.dispatchEvent(new CustomEvent("wallet-update"));
      } else {
        // Redirect to OAuth
        const deviceId = localStorage.getItem("sp_device_id");
        const res = await fetch(`${API_BASE}/api/brokers/${brokerSelect.toLowerCase()}/connect`, {
          headers: { "x-device-id": deviceId || "" },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.authUrl) {
            window.location.href = data.authUrl;
          }
        } else {
          const data = await res.json();
          addToast({ type: "danger", title: "Connection Failed", message: data.error || "Integration not active." });
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
        totalValue += h.value;
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
      <main className="grid grid-cols-1 lg:grid-cols-[1fr_360px] max-w-[1100px] mx-auto w-full p-4 sm:p-8 gap-4 sm:gap-8">

        <div className="lg:col-span-2">
          <PortfolioDoctor />
        </div>

        {/* Left Column: Active Positions */}
        <div>
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

            {/* Holdings Table */}
            <div className="font-mono text-[0.62rem] tracking-[0.15em] text-text-3 uppercase mt-8">{"ACTIVE PORTFOLIO POSITIONS"}</div>
            {loading ? (
              <div className="font-mono text-xs text-text-3 py-8 text-center">FETCHING CURRENT HOLDINGS...</div>
            ) : holdings.length === 0 ? (
              <div className="bg-bg-1 border border-border-custom p-12 rounded text-center my-4">
                <div className="font-display text-[1.5rem] tracking-[0.1em] text-text-3">PORTFOLIO EMPTY</div>
                <div className="font-mono text-xs text-text-3 mt-2">LINK A DEMAT ACCOUNT OR RECORD A TRANSACTION TO SYNC STOCKS</div>
              </div>
            ) : (
              <div className="w-full overflow-x-auto border border-border-custom bg-bg-1 rounded my-4">
                <table className="w-full border-collapse text-left text-[0.8rem]">
                  <thead>
                    <tr className="border-b border-border-custom text-text-2 font-mono uppercase text-[0.65rem] tracking-wider bg-bg-2">
                      <th className="p-4">STOCK</th>
                      <th className="p-4">EXCHANGE</th>
                      <th className="p-4 text-right">QTY</th>
                      <th className="p-4 text-right">AVG PRICE</th>
                      <th className="p-4 text-right">LIVE PRICE</th>
                      <th className="p-4 text-right">TOTAL VALUE</th>
                      <th className="p-4 text-right">UNREALIZED P&amp;L</th>
                      <th className="p-4 text-center">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {holdings.map((h) => (
                      <tr key={h.id} className="border-b border-border-custom hover:bg-bg-2/50 transition-colors duration-150">
                        <td className="p-4 font-bold text-text-custom">{h.displaySym}</td>
                        <td className="p-4 text-text-3 text-[0.7rem]">{h.exchange}</td>
                        <td className="p-4 text-right text-text-custom">{h.quantity.toLocaleString()}</td>
                        <td className="p-4 text-right text-text-custom">{fmt(h.avgPrice, h.currency)}</td>
                        <td className="p-4 text-right text-cyan-custom">{fmt(h.currentPrice, h.currency)}</td>
                        <td className="p-4 text-right text-text-custom">{fmt(h.value, h.currency)}</td>
                        <td className={`p-4 text-right font-bold ${h.pl >= 0 ? "text-green-custom" : "text-red-custom"}`}>
                          {h.pl >= 0 ? "+" : ""}{h.pl.toFixed(2)} ({h.plPct >= 0 ? "+" : ""}{h.plPct.toFixed(2)}%)
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => handleDeletePosition(h.stock)}
                            className="font-mono text-[0.65rem] bg-transparent border border-red-custom text-red-custom py-1 px-2 rounded cursor-pointer transition-colors duration-150 hover:bg-red-dim hover:text-red-custom"
                          >
                            RESET
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Record Form & Tx Feed */}
        <div className="flex flex-col gap-6">
          {/* Link Demat Broker Form */}
          {brokerConnections.some(c => c.broker === "ZERODHA" && c.status === "CONNECTED") ? (
            (() => {
              const zerodhaConn = brokerConnections.find(c => c.broker === "ZERODHA");
              return (
                <section className="bg-bg-1 border border-border-custom p-6 rounded flex flex-col gap-4">
                  <div className="font-mono text-[0.62rem] tracking-[0.15em] text-text-3 uppercase">{"ZERODHA KITE CONNECTION"}</div>
                  
                  <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-center border-b border-border-custom pb-2.5">
                      <span className="font-mono text-[0.65rem] text-text-3 uppercase">Status</span>
                      <span className={`font-mono text-xs font-bold uppercase ${
                        syncingBroker === "ZERODHA" 
                          ? "text-blue-custom animate-pulse" 
                          : zerodhaConn.status === "CONNECTED" 
                            ? "text-green-custom" 
                            : "text-red-custom"
                      }`}>
                        {syncingBroker === "ZERODHA" ? "Syncing" : "Connected"}
                      </span>
                    </div>

                    <div className="flex justify-between items-center border-b border-border-custom pb-2.5">
                      <span className="font-mono text-[0.65rem] text-text-3 uppercase">Last Synced</span>
                      <span className="font-mono text-xs text-text-custom">
                        {zerodhaConn.lastSyncAt 
                          ? new Date(zerodhaConn.lastSyncAt).toLocaleString("en-US", {
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

                    {zerodhaConn.lastError && (
                      <div className="p-2.5 bg-red-dim/15 border border-red-custom/20 rounded text-[0.62rem] text-red-custom font-mono">
                        Error: {zerodhaConn.lastError}
                      </div>
                    )}

                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={async () => {
                          setSyncingBroker("ZERODHA");
                          try {
                            const deviceId = localStorage.getItem("sp_device_id");
                            const res = await fetch(`${API_BASE}/api/brokers/ZERODHA/sync`, {
                              method: "POST",
                              headers: { "x-device-id": deviceId || "" }
                            });
                            if (res.ok) {
                              addToast({ type: "success", title: "Broker Synced", message: "Successfully synced Zerodha holdings!" });
                              fetchData();
                            } else {
                              const err = await res.json();
                              addToast({ type: "danger", title: "Sync Failed", message: err.error || "Failed to sync." });
                            }
                          } catch {
                            addToast({ type: "danger", title: "Error", message: "Network error during sync." });
                          } finally {
                            setSyncingBroker(null);
                          }
                        }}
                        disabled={syncingBroker === "ZERODHA"}
                        className="flex-1 bg-green-custom hover:bg-green-custom/90 text-bg font-mono text-xs font-bold py-2.5 rounded cursor-pointer uppercase transition-opacity duration-150 disabled:opacity-50 text-center border-none"
                      >
                        {syncingBroker === "ZERODHA" ? "SYNCING..." : "SYNC ZERODHA"}
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm("Are you sure you want to disconnect Zerodha? This will stop automatic synchronization.")) return;
                          try {
                            const deviceId = localStorage.getItem("sp_device_id");
                            const res = await fetch(`${API_BASE}/api/brokers/ZERODHA`, {
                              method: "DELETE",
                              headers: { "x-device-id": deviceId || "" }
                            });
                            if (res.ok) {
                              addToast({ type: "success", title: "Disconnected", message: "Zerodha disconnected successfully." });
                              fetchData();
                            } else {
                              addToast({ type: "danger", title: "Error", message: "Failed to disconnect." });
                            }
                          } catch {
                            addToast({ type: "danger", title: "Error", message: "Network error during disconnect." });
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
            })()
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
          STOCKPULSE · DATABASE STORAGE LOGS ACTIVE · SECURE LOCAL PERSISTENCE
        </div>
        <div className="flex items-center gap-3 font-mono text-[0.6rem] text-text-4">
          <span>© 2026</span>
        </div>
      </footer>

      {/* Toasts */}
      <NotificationSystem toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}
