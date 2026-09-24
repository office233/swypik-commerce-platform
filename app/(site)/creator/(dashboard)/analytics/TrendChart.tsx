"use client";

/**
 * Graficul de tendință al dashboard-ului de creator.
 *
 * Trăiește într-un fișier separat ca `recharts` (~107 kB gz) să poată fi
 * încărcat leneș din AnalyticsClient: altfel se descărca și se parsa pe calea
 * critică a rutei, înainte ca datele graficului să fie măcar cerute
 * (audit perf 2026-08-24).
 */

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

export type TrendPoint = { date: string;[key: string]: string | number };

type Props = {
  data: TrendPoint[];
  dataKey: string;
  stroke: string;
  /** Formatare opțională a valorii din tooltip (ex. sumă în valută). */
  formatValue?: (value: number) => string;
};

export default function TrendChart({ data, dataKey, stroke, formatValue }: Props) {
  return (
    <ResponsiveContainer width="100%" height={256}>
      <LineChart data={data}>
        <CartesianGrid stroke="#F0F0F0" strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip
          contentStyle={{ background: "#0D0D0D", border: "none", borderRadius: 12, color: "#FFF", fontSize: 12 }}
          labelStyle={{ color: "#FFF" }}
          {...(formatValue ? { formatter: (value: unknown) => formatValue(Number(value)) } : {})}
        />
        <Line type="monotone" dataKey={dataKey} stroke={stroke} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
