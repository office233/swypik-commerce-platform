"use client";

import type { ServerTotals } from "./types";

export function SummaryCards({ totals, loading }: { totals: ServerTotals; loading: boolean }) {
  const cards = [
    { label: "Total produse", value: totals.total },
    { label: "Active", value: totals.active },
    { label: "Cu imagine", value: totals.with_image },
    { label: "Cu video", value: totals.with_video },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{c.label}</p>
          {loading ? (
            <div className="mt-3 h-8 w-16 animate-pulse rounded-lg bg-slate-100" />
          ) : (
            <p className="mt-3 text-2xl font-black text-slate-900 tabular-nums">{c.value}</p>
          )}
        </div>
      ))}
    </div>
  );
}
