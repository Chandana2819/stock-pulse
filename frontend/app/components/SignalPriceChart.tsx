"use client";

import { useEffect, useRef } from "react";

type PricePoint = { time: number; value: number };

type Props = {
  points: PricePoint[];
  stock: string;
};

// Line chart of the daily prices captured from uploaded StockSignals data —
// not a market OHLC feed, so a line series (not candles) is the honest
// representation of what we actually have: one closing price per upload.
export default function SignalPriceChart({ points, stock }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current || points.length === 0) return;

    let chart: any;

    (async () => {
      const { createChart, ColorType, LineSeries } = await import("lightweight-charts");

      chartRef.current!.innerHTML = "";

      chart = createChart(chartRef.current!, {
        layout: { background: { type: ColorType.Solid, color: "#0a0a0f" }, textColor: "#9ca3af" },
        grid: { vertLines: { color: "#1a1a2e" }, horzLines: { color: "#1a1a2e" } },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: "#1a1a2e" },
        timeScale: { borderColor: "#1a1a2e", timeVisible: true },
        width: chartRef.current!.clientWidth,
        height: 260,
      });

      const series = chart.addSeries(LineSeries, { color: "#00d4aa", lineWidth: 2 });
      series.setData(points.map((p) => ({ time: p.time as any, value: p.value })));
      chart.timeScale().fitContent();

      const handleResize = () => {
        if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth });
      };
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    })();

    return () => {
      if (chart) chart.remove();
    };
  }, [points, stock]);

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-[120px] font-mono text-[0.7rem] text-text-3 tracking-[0.1em] border border-border-custom bg-bg-2">
        <span>No uploaded price history for {stock} yet</span>
      </div>
    );
  }

  return <div ref={chartRef} className="w-full border border-border-custom" />;
}
