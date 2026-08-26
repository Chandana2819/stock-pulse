"use client";

type Attribution = {
  stockChangePct: number;
  breakdown: { label: string; weightPct: number; detail: string }[];
  mainReasons: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  disclaimer: string;
};

const CONF_COLOR: Record<Attribution["confidence"], string> = {
  HIGH: "text-green-custom",
  MEDIUM: "text-amber-custom",
  LOW: "text-text-3",
};

const BAR_COLORS = ["bg-cyan-custom", "bg-purple-custom", "bg-amber-custom", "bg-text-3"];

export default function WhyMovingPanel({ attribution, symbol }: { attribution: Attribution; symbol: string }) {
  const isUp = attribution.stockChangePct >= 0;
  return (
    <div className="border border-border-bright bg-bg-1 overflow-hidden">
      <div className="flex items-center justify-between py-[0.6rem] px-6 border-b border-border-custom bg-bg-2">
        <span className="font-mono text-[0.65rem] tracking-[0.12em] text-text-3 uppercase">// WHY IS {symbol} MOVING?</span>
        <span className={`font-mono text-[0.6rem] font-bold ${CONF_COLOR[attribution.confidence]}`}>{attribution.confidence} CONFIDENCE</span>
      </div>
      <div className="p-6 flex flex-col gap-4">
        <div className={`font-display text-3xl tracking-[0.1em] ${isUp ? "text-green-custom" : "text-red-custom"}`}>
          {isUp ? "▲" : "▼"} {Math.abs(attribution.stockChangePct).toFixed(2)}%
        </div>

        <div className="flex h-3 rounded overflow-hidden border border-border-custom">
          {attribution.breakdown.map((b, i) => (
            <div key={b.label} className={BAR_COLORS[i % BAR_COLORS.length]} style={{ width: `${Math.max(2, b.weightPct)}%` }} title={`${b.label}: ${b.weightPct}%`} />
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          {attribution.breakdown.map((b, i) => (
            <div key={b.label} className="flex items-center gap-1.5 font-mono text-[0.62rem] text-text-2">
              <span className={`w-2 h-2 rounded-sm ${BAR_COLORS[i % BAR_COLORS.length]}`} />
              {b.label} {b.weightPct}%
            </div>
          ))}
        </div>

        <div>
          <div className="font-mono text-[0.58rem] tracking-[0.18em] text-text-3 uppercase mb-2">MAIN REASONS</div>
          <ul className="flex flex-col gap-1.5">
            {attribution.mainReasons.map((r, i) => (
              <li key={i} className="text-xs text-text-2 leading-relaxed flex gap-2">
                <span className="text-cyan-custom shrink-0">{i + 1}.</span> {r}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {attribution.breakdown.map((b) => (
            <div key={b.label} className="p-2.5 border border-border-custom bg-bg-2">
              <div className="font-mono text-[0.6rem] text-text-2 font-bold mb-0.5">{b.label}</div>
              <div className="text-[0.62rem] text-text-3 leading-snug">{b.detail}</div>
            </div>
          ))}
        </div>

        <div className="font-mono text-[0.55rem] text-text-4 tracking-[0.05em] border-t border-border-custom pt-3">{attribution.disclaimer}</div>
      </div>
    </div>
  );
}
