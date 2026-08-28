"use client";

import Link from "next/link";
import CandleChart from "./CandleChart";

type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
};

type CandlePoint = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type Props = {
  data: {
    stock: string;
    price: number;
    prevClose: number;
    candles: CandlePoint[];
    risk: string;
    suggestion: string;
    action: string;
    reason: string;
    signal: "bullish" | "bearish" | "neutral";
    alertLevel: "danger" | "warning" | "success" | "info";
    news: NewsItem[];
  };
  onBuy?: () => void;
  onSell?: () => void;
  ownedQty?: number;
};

const ACTION_STYLE: Record<string, string> = {
  BUY: "text-green-custom border-green-custom bg-green-dim/10",
  "BUY (risky)": "text-amber-custom border-amber-custom bg-amber-dim/10",
  WATCH: "text-cyan-custom border-cyan-custom bg-cyan-custom/10",
  SELL: "text-red-custom border-red-custom bg-red-dim/10",
  REDUCE: "text-amber-custom border-amber-custom bg-amber-dim/10",
  AVOID: "text-red-custom border-red-custom bg-red-dim/10",
  WAIT: "text-amber-custom border-amber-custom bg-amber-dim/10",
  HOLD: "text-blue-custom border-blue-custom bg-blue-dim/10",
  "NOT FOUND": "text-text-3 border-border-bright bg-bg-3",
  ERROR: "text-text-3 border-border-bright bg-bg-3",
};

const SIGNAL_DOT_STYLE = {
  bullish: "bg-green-custom shadow-[0_0_8px_rgba(0,229,160,0.8)] animate-custom-pulse",
  bearish: "bg-red-custom shadow-[0_0_8px_rgba(255,59,92,0.8)] animate-custom-pulse",
  neutral: "bg-amber-custom shadow-[0_0_8px_rgba(255,176,32,0.8)]",
};

const RISK_STYLE = (risk: string) => {
  const r = risk.toLowerCase();
  if (r === "high") return "text-red-custom font-mono font-bold text-[0.72rem] tracking-[0.1em]";
  if (r === "medium") return "text-amber-custom font-mono font-bold text-[0.72rem] tracking-[0.1em]";
  if (r === "low") return "text-green-custom font-mono font-bold text-[0.72rem] tracking-[0.1em]";
  return "text-text-3 font-mono text-[0.72rem] tracking-[0.1em]";
};

function timeAgo(dateStr: string) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getExchange(stock: string) {
  if (stock.endsWith(".NS")) return "NSE";
  if (stock.endsWith(".BO")) return "BSE";
  return "GLOBAL";
}

function getBaseSymbol(stock: string) {
  return stock.replace(/\.(NS|BO)$/, "");
}

export default function ResultCard({ data, onBuy, onSell, ownedQty = 0 }: Props) {
  const change = data.prevClose ? ((data.price - data.prevClose) / data.prevClose) * 100 : 0;
  const isUp = change >= 0;
  const exchange = getExchange(data.stock);
  const displaySym = getBaseSymbol(data.stock);

  return (
    <div className="animate-card-enter grid grid-cols-1 gap-0 border border-border-bright bg-bg-1 overflow-hidden">
      {/* ── Header ── */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] items-start gap-4 p-[1.25rem_1.5rem] border-b border-border-custom relative">
        <div className="flex flex-col gap-[0.4rem]">
          <div className="flex items-center gap-[0.6rem]">
            <h2 className="font-display text-2xl sm:text-[2rem] tracking-[0.12em] text-text-custom leading-none">{displaySym}</h2>
            <span className="font-mono text-[0.6rem] tracking-[0.1em] text-text-3 px-[0.4rem] py-[0.15rem] border border-border-custom self-center">{exchange}</span>
            <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${SIGNAL_DOT_STYLE[data.signal] || SIGNAL_DOT_STYLE.neutral}`} />
            <span className={`font-mono text-[0.65rem] font-bold tracking-[0.15em] ${
              data.signal === "bullish" ? "text-green-custom" : data.signal === "bearish" ? "text-red-custom" : "text-amber-custom"
            }`}>
              {data.signal.toUpperCase()}
            </span>
          </div>
          <Link href={`/stock/${data.stock}`} className="font-mono text-[0.62rem] text-cyan-custom hover:underline no-underline w-fit">
            VIEW FULL ANALYSIS — DECISION ENGINE, WHY IT'S MOVING, FUNDAMENTALS →
          </Link>
        </div>

        <div className="flex flex-col items-start sm:items-end gap-[0.25rem]">
          <span className="font-mono text-xl sm:text-[1.8rem] font-bold tracking-[0.03em] text-text-custom leading-none">
            {exchange === "GLOBAL" ? "$" : "₹"}{data.price.toFixed(2)}
          </span>
          <span className={`font-mono text-[0.85rem] font-bold tracking-[0.05em] ${isUp ? "text-green-custom" : "text-red-custom"}`}>
            {isUp ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
          </span>
          {data.prevClose > 0 && (
            <span className="font-mono text-[0.62rem] text-text-3 tracking-[0.05em]">
              PREV {exchange === "GLOBAL" ? "$" : "₹"}{data.prevClose.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* ── Candlestick Chart ── */}
      <CandleChart candles={data.candles} stock={data.stock} />

      {/* ── Action Panel ── */}
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-0 border-b border-border-custom">
        <div className="flex flex-col gap-3 items-center justify-center p-6 border-b sm:border-b-0 sm:border-r border-border-custom min-w-[160px]">
          <div className="flex flex-col items-center w-full">
            <span className="font-mono text-[0.55rem] text-text-3 tracking-[0.1em] uppercase mb-1">ALGO SIGNAL</span>
            <div className={`font-display text-[1.3rem] tracking-[0.2em] p-2 text-center border-2 w-full relative overflow-hidden ${ACTION_STYLE[data.action] || ACTION_STYLE.HOLD}`}>
              {data.action}
            </div>
          </div>
          <div className="flex gap-2 w-full">
            {onBuy && (
              <button
                className={`font-mono text-[0.72rem] tracking-[0.1em] font-bold p-2 border border-border-bright bg-bg-3 text-text-custom cursor-pointer transition-all duration-150 hover:border-green-custom hover:bg-green-dim hover:text-green-custom flex-1 ${
                  data.action === "BUY" || data.action === "BUY (risky)" ? "border-green-custom bg-green-dim text-green-custom animate-glow-buy" : ""
                }`}
                onClick={onBuy}
              >
                BUY
              </button>
            )}
            {onSell && ownedQty > 0 && (
              <button
                className="font-mono text-[0.72rem] tracking-[0.1em] font-bold p-2 border border-border-bright bg-bg-3 text-text-custom cursor-pointer transition-all duration-150 hover:border-red-custom hover:bg-red-dim hover:text-red-custom flex-1"
                onClick={onSell}
              >
                SELL
              </button>
            )}
          </div>
          {ownedQty > 0 && (
            <div className="font-mono text-[0.65rem] text-text-2">
              HOLDING: {ownedQty} SHARE{ownedQty > 1 ? "S" : ""}
            </div>
          )}
        </div>
        <div className="grid grid-rows-3 p-0">
          <div className="grid grid-cols-[70px_1fr] items-center gap-4 py-[0.65rem] px-5 border-b border-border-custom last:border-b-0">
            <span className="font-mono text-[0.58rem] tracking-[0.18em] text-text-3 uppercase shrink-0">RISK</span>
            <span className={RISK_STYLE(data.risk)}>{data.risk}</span>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-4 py-[0.65rem] px-5 border-b border-border-custom last:border-b-0">
            <span className="font-mono text-[0.58rem] tracking-[0.18em] text-text-3 uppercase shrink-0">SIGNAL</span>
            <span className="text-xs text-text-2 leading-[1.4]">{data.suggestion}</span>
          </div>
          <div className="grid grid-cols-[70px_1fr] items-center gap-4 py-[0.65rem] px-5 border-b border-border-custom last:border-b-0">
            <span className="font-mono text-[0.58rem] tracking-[0.18em] text-text-3 uppercase shrink-0">REASON</span>
            <span className="text-xs text-text-2 leading-[1.4]">{data.reason}</span>
          </div>
        </div>
      </div>

      {/* ── News Feed ── */}
      <div className="p-0">
        <h3 className="flex items-center gap-2 py-[0.6rem] px-6 font-mono text-[0.62rem] tracking-[0.18em] text-text-3 border-b border-border-custom bg-bg-2 uppercase font-normal">
          <span className="w-[6px] h-[6px] rounded-full bg-red-custom animate-custom-pulse shrink-0" />
          LIVE NEWS · {displaySym}
        </h3>
        <div className="flex flex-col">
          {data.news.map((n, i) => (
            <a
              key={i}
              href={n.link}
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline border-b border-border-custom last:border-b-0 transition-colors duration-150 hover:bg-bg-2 group"
            >
              <div className="grid grid-cols-[2rem_1fr_1rem] gap-3 items-center py-[0.65rem] px-5">
                <span className="font-mono text-[0.6rem] text-text-4 tracking-[0.05em] self-start pt-[0.1rem]">{String(i + 1).padStart(2, "0")}</span>
                <div className="flex flex-col gap-[0.25rem] min-w-0">
                  <p className="text-xs text-text-2 leading-[1.45] transition-colors duration-150 group-hover:text-text-custom">{n.title}</p>
                  <div className="flex items-center gap-2">
                    {n.source && <span className="font-mono text-[0.58rem] text-blue-custom tracking-[0.05em]">{n.source}</span>}
                    {n.pubDate && <span className="font-mono text-[0.58rem] text-text-3">{timeAgo(n.pubDate)}</span>}
                  </div>
                </div>
                <span className="text-text-3 text-[0.7rem] self-start pt-[0.1rem] transition-colors duration-150 shrink-0 group-hover:text-green-custom">↗</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}