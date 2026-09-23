"use client";

import { useEffect, useRef } from "react";
import { createChart, ColorType } from "lightweight-charts";

interface TradingViewChartProps {
  symbol?: string;
}

export default function TradingViewChart({ symbol = "ETH/USDT" }: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#090d16" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      width: chartContainerRef.current.clientWidth,
      height: 380,
      timeScale: {
        borderColor: "#334155",
        timeVisible: true,
      },
    });

    const candlestickSeries = (chart as any).addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });

    // Date demonstrative de lumânări recente
    const now = Math.floor(Date.now() / 1000);
    const day = 86400;
    const initialData = [
      { time: now - 10 * day, open: 2450, high: 2510, low: 2420, close: 2480 },
      { time: now - 9 * day, open: 2480, high: 2530, low: 2460, close: 2520 },
      { time: now - 8 * day, open: 2520, high: 2580, low: 2500, close: 2540 },
      { time: now - 7 * day, open: 2540, high: 2550, low: 2470, close: 2490 },
      { time: now - 6 * day, open: 2490, high: 2600, low: 2480, close: 2580 },
      { time: now - 5 * day, open: 2580, high: 2640, low: 2560, close: 2620 },
      { time: now - 4 * day, open: 2620, high: 2670, low: 2590, close: 2610 },
      { time: now - 3 * day, open: 2610, high: 2650, low: 2580, close: 2635 },
      { time: now - 2 * day, open: 2635, high: 2690, low: 2620, close: 2670 },
      { time: now - 1 * day, open: 2670, high: 2710, low: 2640, close: 2650 },
    ];

    candlestickSeries.setData(initialData);

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [symbol]);

  return (
    <div className="w-full bg-[#090d16] rounded-2xl border border-slate-800 p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-white font-extrabold text-lg">{symbol}</span>
          <span className="text-emerald-400 font-bold text-sm bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            +4.25% (24h)
          </span>
        </div>
        <div className="text-xs text-slate-400 font-medium">Powered by TradingView Engine</div>
      </div>
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}
