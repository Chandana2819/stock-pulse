"use client";

import { useEffect, useRef } from "react";

type CandlePoint = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type Props = {
  candles: CandlePoint[];
  stock: string;
};

export default function CandleChart({ candles, stock }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;

    let chart: any;

    (async () => {
      const { createChart, ColorType, CandlestickSeries } = await import("lightweight-charts");

      chartRef.current!.innerHTML = "";

      chart = createChart(chartRef.current!, {
        layout: {
          background: { type: ColorType.Solid, color: "#0a0a0f" },
          textColor: "#9ca3af",
        },
        grid: {
          vertLines: { color: "#1a1a2e" },
          horzLines: { color: "#1a1a2e" },
        },
        crosshair: {
          mode: 1,
        },
        rightPriceScale: {
          borderColor: "#1a1a2e",
        },
        timeScale: {
          borderColor: "#1a1a2e",
          timeVisible: true,
        },
        width: chartRef.current!.clientWidth,
        height: 320,
      });

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#00d4aa",
        downColor: "#ff4757",
        borderUpColor: "#00d4aa",
        borderDownColor: "#ff4757",
        wickUpColor: "#00d4aa",
        wickDownColor: "#ff4757",
      });

      const formatted = candles.map((c) => ({
        time: c.time as any,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      candleSeries.setData(formatted);
      chart.timeScale().fitContent();

      const handleResize = () => {
        if (chartRef.current) {
          chart.applyOptions({ width: chartRef.current.clientWidth });
        }
      };
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
      };
    })();

    return () => {
      if (chart) chart.remove();
    };
  }, [candles, stock]);

  if (candles.length === 0) {
    return (
      <div className="flex items-center justify-center h-[120px] font-mono text-[0.7rem] text-text-3 tracking-[0.1em] border-b border-border-custom">
        <span>No chart data available</span>
      </div>
    );
  }

  return (
    <div className="border-b border-border-custom">
      <div className="flex items-center justify-between py-[0.6rem] px-6 border-b border-border-custom bg-bg-2">
        <span className="font-mono text-[0.65rem] tracking-[0.12em] text-text-3 uppercase">5Y OHLC · {stock}</span>
        <span className="py-[0.15rem] px-[0.45rem] bg-bg-3 border border-border-custom font-mono text-[0.58rem] tracking-[0.1em] text-text-3 uppercase">Candlestick</span>
      </div>
      <div ref={chartRef} className="w-full" />
    </div>
  );
}