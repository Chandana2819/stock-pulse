"use client";

import Link from "next/link";

export type KpiDetailRow = {
  label: string;
  value: string;
  color?: string;
};

export type KpiDetailData = {
  title: string;
  badge?: string;
  value: string;
  valueColor?: string;
  subtitle?: string;
  description: string;
  rows?: KpiDetailRow[];
  footerAction?: { label: string; href: string };
  chartPoints?: number[];
  chartColor?: string;
};

function DetailChart({ points, color }: { points: number[]; color: string }) {
  const width = 400;
  const height = 120;
  const pad = 4;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((p - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });
  const linePath = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1][0].toFixed(1)},${height} L${coords[0][0].toFixed(1)},${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-28" preserveAspectRatio="none">
      <defs>
        <linearGradient id="kpiChartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#kpiChartFill)" stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Props = {
  data: KpiDetailData | null;
  onClose: () => void;
};

export default function KpiDetailModal({ data, onClose }: Props) {
  if (!data) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-bg-1 border border-border-bright w-full max-w-md max-h-[85vh] overflow-y-auto rounded-lg shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border-custom bg-bg-2 sticky top-0 z-10">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="font-display text-base font-bold tracking-wider text-text-custom uppercase">
                {data.title}
              </span>
              {data.badge && (
                <span className="font-mono text-[0.6rem] text-text-3 px-1.5 py-0.5 border border-border-custom rounded bg-bg-1">
                  {data.badge}
                </span>
              )}
            </div>
            {data.subtitle && (
              <span className="font-mono text-[0.65rem] text-text-3">{data.subtitle}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-text-3 hover:text-text-custom font-mono text-lg px-2 py-1 transition-colors shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4">
          <div className={`font-mono text-2xl font-bold ${data.valueColor || "text-text-custom"}`}>
            {data.value}
          </div>

          {data.chartPoints && data.chartPoints.length > 1 && (
            <DetailChart points={data.chartPoints} color={data.chartColor || "#00e5a0"} />
          )}

          <p className="font-mono text-xs text-text-2 leading-relaxed">{data.description}</p>

          {data.rows && data.rows.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-border-custom pt-3">
              {data.rows.map((row, i) => (
                <div key={i} className="flex items-center justify-between font-mono text-xs">
                  <span className="text-text-3">{row.label}</span>
                  <span className={`font-bold ${row.color || "text-text-custom"}`}>{row.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-border-custom bg-bg-2 mt-auto">
          {data.footerAction && (
            <Link
              href={data.footerAction.href}
              onClick={onClose}
              className="font-mono text-xs bg-green-custom text-bg font-bold py-2 px-4 rounded hover:bg-opacity-90 transition-colors"
            >
              {data.footerAction.label} →
            </Link>
          )}
          <button
            onClick={onClose}
            className="font-mono text-xs bg-transparent border border-border-custom text-text-2 py-2 px-4 rounded hover:bg-bg-3 hover:text-text-custom transition-colors"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
