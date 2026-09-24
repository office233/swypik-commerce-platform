"use client";

import { useEffect, useRef } from "react";
import { createChart, ColorType, CandlestickSeries, type UTCTimestamp } from "lightweight-charts";
import type { CryptoOhlcPoint } from "@/lib/crypto/coingecko";

interface CryptoChartProps {
  /** Lumânări OHLC reale (CoinGecko), deja încărcate de componenta părinte. */
  candles: CryptoOhlcPoint[];
}

/**
 * Grafic candlestick pe bază de date reale (fără date demonstrative, fără
 * pretenția de a fi "TradingView" — folosim lightweight-charts, atribuit ca
 * atare în UI-ul părinte).
 */
export default function CryptoChart({ candles }: CryptoChartProps) {
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

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });

    candlestickSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

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
  }, [candles]);

  return <div ref={chartContainerRef} className="w-full" />;
}
