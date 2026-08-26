"use client";

import { useState, useEffect } from "react";

type Holding = {
  stock: string;
  quantity: number;
  avgPrice: number;
  currency: "INR" | "USD";
};

type Props = {
  isOpen: boolean;
  type: "BUY" | "SELL";
  stockSymbol: string;
  displaySym: string;
  price: number;
  currency: "INR" | "USD";
  walletBalance: number;
  existingHolding?: Holding;
  onClose: () => void;
  onExecute: (type: "BUY" | "SELL", quantity: number, price: number) => void;
};

export default function TradeModal({
  isOpen,
  type,
  stockSymbol,
  displaySym,
  price,
  currency,
  walletBalance,
  existingHolding,
  onClose,
  onExecute,
}: Props) {
  const [qty, setQty] = useState<number>(1);
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      setQty(1);
      setErrorMsg("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isBuy = type === "BUY";
  const subtotal = price * qty;
  const fees = subtotal * 0.001; // 0.1% brokerage fee
  const total = isBuy ? subtotal + fees : subtotal - fees;

  const fmtCurrency = (val: number) => {
    return currency === "USD"
      ? `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `₹${val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleQtyChange = (val: string) => {
    const num = parseInt(val);
    if (isNaN(num) || num <= 0) {
      setQty(0);
      setErrorMsg("Quantity must be a positive integer.");
      return;
    }
    setErrorMsg("");
    setQty(num);

    // Dynamic error checking
    if (isBuy && num * price * 1.001 > walletBalance) {
      setErrorMsg("Insufficient funds to execute this trade.");
    } else if (!isBuy && existingHolding && num > existingHolding.quantity) {
      setErrorMsg(`You cannot sell more than your current holdings (${existingHolding.quantity} shares).`);
    }
  };

  const adjustQty = (amount: number) => {
    const next = Math.max(1, qty + amount);
    setQty(next);
    setErrorMsg("");

    if (isBuy && next * price * 1.001 > walletBalance) {
      setErrorMsg("Insufficient funds to execute this trade.");
    } else if (!isBuy && existingHolding && next > existingHolding.quantity) {
      setErrorMsg(`You cannot sell more than your current holdings (${existingHolding.quantity} shares).`);
    }
  };

  const setMax = () => {
    if (isBuy) {
      const maxBuyable = Math.floor(walletBalance / (price * 1.001));
      setQty(maxBuyable);
      setErrorMsg(maxBuyable <= 0 ? "You do not have enough funds." : "");
    } else if (existingHolding) {
      setQty(existingHolding.quantity);
      setErrorMsg("");
    }
  };

  const executeTrade = () => {
    if (qty <= 0) return;
    if (isBuy && total > walletBalance) {
      setErrorMsg("Insufficient funds.");
      return;
    }
    if (!isBuy && existingHolding && qty > existingHolding.quantity) {
      setErrorMsg("Not enough shares to sell.");
      return;
    }
    onExecute(type, qty, price);
  };

  const isBtnDisabled = qty <= 0 || !!errorMsg;

  return (
    <div className="fixed inset-0 bg-[rgba(5,5,8,0.85)] backdrop-blur-[4px] z-[1000] flex items-center justify-center p-4">
      <div className="w-full max-w-[440px] bg-bg-1 border border-border-bright shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex flex-col rounded">
        {/* Header */}
        <div className="flex justify-between items-center p-[1rem_1.5rem] border-b border-border-custom">
          <div className="flex items-center gap-3">
            <span className={`font-mono text-[0.58rem] tracking-[0.1em] px-[0.4rem] py-[0.15rem] font-bold text-bg rounded-sm ${isBuy ? "bg-green-custom" : "bg-red-custom"}`}>
              {type}
            </span>
            <h2 className="font-display text-[1.4rem] tracking-[0.1em] text-text-custom leading-none">{displaySym}</h2>
          </div>
          <button className="bg-transparent border-none text-text-3 text-lg cursor-pointer transition-colors duration-150 hover:text-text-custom" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-bg-2 border border-border-custom p-3 flex flex-col gap-1 rounded">
              <span className="font-mono text-[0.55rem] text-text-3 tracking-[0.05em]">CURRENT PRICE</span>
              <span className="font-mono text-[1rem] font-bold text-green-custom">{fmtCurrency(price)}</span>
            </div>
            <div className="bg-bg-2 border border-border-custom p-3 flex flex-col gap-1 rounded">
              <span className="font-mono text-[0.55rem] text-text-3 tracking-[0.05em]">CASH BALANCE</span>
              <span className="font-mono text-[1rem] font-bold text-text-custom">{fmtCurrency(walletBalance)}</span>
            </div>
          </div>

          {existingHolding && (
            <div className="bg-amber-custom/5 border border-amber-custom/15 p-[0.5rem_0.75rem] font-mono text-[0.65rem] text-amber-custom flex justify-between rounded">
              <span>EXISTING POSITION: {existingHolding.quantity} SHARES</span>
              <span className="opacity-30 mx-1">|</span>
              <span>AVG COST: {fmtCurrency(existingHolding.avgPrice)}</span>
            </div>
          )}

          {/* Qty controller */}
          <div className="qty-control-section">
            <label className="font-mono text-[0.6rem] text-text-3 tracking-[0.1em]">QUANTITY</label>
            <div className="flex gap-[2px]">
              <button type="button" className="bg-bg-3 border border-border-bright text-text-2 font-mono text-[0.65rem] px-2 cursor-pointer transition-all duration-150 rounded-sm hover:bg-bg-4 hover:text-text-custom" onClick={() => adjustQty(-10)}>
                -10
              </button>
              <button type="button" className="bg-bg-3 border border-border-bright text-text-2 font-mono text-[0.65rem] px-2 cursor-pointer transition-all duration-150 rounded-sm hover:bg-bg-4 hover:text-text-custom" onClick={() => adjustQty(-1)}>
                -1
              </button>
              <input
                type="number"
                min={1}
                value={qty || ""}
                onChange={(e) => handleQtyChange(e.target.value)}
                className="flex-1 bg-bg-2 border border-border-bright p-2 font-mono text-[1rem] text-text-custom text-center outline-none rounded-sm"
              />
              <button type="button" className="bg-bg-3 border border-border-bright text-text-2 font-mono text-[0.65rem] px-2 cursor-pointer transition-all duration-150 rounded-sm hover:bg-bg-4 hover:text-text-custom" onClick={() => adjustQty(1)}>
                +1
              </button>
              <button type="button" className="bg-bg-3 border border-border-bright text-text-2 font-mono text-[0.65rem] px-2 cursor-pointer transition-all duration-150 rounded-sm hover:bg-bg-4 hover:text-text-custom" onClick={() => adjustQty(10)}>
                +10
              </button>
              <button type="button" className="bg-border-bright border border-border-bright text-text-custom font-mono text-[0.65rem] font-bold px-2 cursor-pointer transition-all duration-150 rounded-sm hover:bg-bg-4" onClick={setMax}>
                MAX
              </button>
            </div>
          </div>

          {/* Receipt */}
          <div className="bg-bg-2 border border-border-custom p-4 flex flex-col gap-2 rounded">
            <div className="flex justify-between font-mono text-[0.7rem] text-text-2">
              <span>Subtotal</span>
              <span>{fmtCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between font-mono text-[0.7rem] text-text-2">
              <span>Brokerage Fee (0.1%)</span>
              <span>{fmtCurrency(fees)}</span>
            </div>
            <div className="h-[1px] bg-border-custom my-1" />
            <div className="flex justify-between font-mono text-xs font-bold text-text-custom">
              <span>Estimated {isBuy ? "Total Cost" : "Total Proceed"}</span>
              <span className="text-green-custom">{fmtCurrency(total)}</span>
            </div>
          </div>

          {/* Errors */}
          {errorMsg && (
            <div className="font-mono text-[0.65rem] text-red-custom bg-red-dim border border-red-custom/20 p-2 rounded-sm">
              ⚠ {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-[1rem_1.5rem] border-t border-border-custom bg-bg-2">
          <button type="button" className="bg-transparent border border-border-bright text-text-2 font-mono text-[0.7rem] tracking-[0.05em] py-2 px-4 cursor-pointer transition-all duration-150 rounded-sm hover:bg-bg-3 hover:text-text-custom" onClick={onClose}>
            CANCEL
          </button>
          <button
            type="button"
            className={`font-mono text-[0.7rem] tracking-[0.05em] font-bold py-2 px-4 cursor-pointer border-none transition-all duration-150 rounded-sm disabled:opacity-40 disabled:cursor-not-allowed ${
              isBuy
                ? "bg-green-custom text-bg hover:not-disabled:shadow-[0_0_20px_rgba(0,229,160,0.5)]"
                : "bg-red-custom text-text-custom hover:not-disabled:shadow-[0_0_20px_rgba(255,59,92,0.5)]"
            }`}
            onClick={executeTrade}
            disabled={isBtnDisabled}
          >
            EXECUTE ORDER
          </button>
        </div>
      </div>
    </div>
  );
}
