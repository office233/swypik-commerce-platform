"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { formatCurrency } from "@/lib/i18n/currency";
import type { Currency } from "@/lib/i18n/config";
import { useFormatPrice } from "@/components/i18n/useFormatPrice";

type Range = "7d" | "30d" | "90d" | "all";

interface AnalyticsData {
  range: Range;
  summary: {
    totalViews: number; totalLikes: number; totalComments: number;
    totalShares: number; totalSaves: number; totalEarningsCents: number;
    earningsCurrency: string; videosPublished: number;
    avgCompletionRate: number; conversionRate: number; followersGained: number;
    productCtr: number; productClicks: number;
    attributedSalesCents: number; attributedOrders: number;
    creatorFundCents: number;
  };
  topVideos: Array<{
    id: string; title: string; thumbnail: string | null;
    views: number; likes: number; earningsCents: number;
  }>;
  viewsOverTime: Array<{ date: string; views: number }>;
  earningsOverTime: Array<{ date: string; cents: number }>;
  audienceTopCountries: Array<{ country: string; percentage: number }>;
  audienceAgeBuckets: Array<{ bucket: string; percentage: number }>;
}

const RANGES: { value: Range; label: string }[] = [
  { value: "7d", label: "7 zile" },
  { value: "30d", label: "30 zile" },
  { value: "90d", label: "90 zile" },
  { value: "all", label: "Toata perioada" },
];

type SortKey = "views" | "likes" | "earnings";

function formatNumber(n: number): string {
  return new Intl.NumberFormat("ro-RO").format(n);
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5 flex flex-col gap-1">
      <span className="text-xs font-bold text-[#6E6E80] uppercase tracking-wide">{label}</span>
      <span className="text-3xl font-bold text-[#0D0D0D] tabular-nums">{value}</span>
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-[#E5E5E5] rounded-xl ${className ?? ""}`} />;
}

export default function AnalyticsClient() {
  const [range, setRange] = useState<Range>("30d");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const fmt = useFormatPrice();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/creator/analytics?range=${range}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: AnalyticsData) => { if (!cancelled) setData(json); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const sortedTop = useMemo(() => {
    if (!data) return [];
    const arr = [...data.topVideos];
    arr.sort((a, b) => {
      if (sortKey === "views") return b.views - a.views;
      if (sortKey === "likes") return b.likes - a.likes;
      return b.earningsCents - a.earningsCents;
    });
    return arr;
  }, [data, sortKey]);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#0D0D0D]">Analytics</h1>
          <p className="text-sm text-[#6E6E80] mt-1">Performanta clipurilor tale si castigurile pe perioada.</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap snap-start transition ${range === r.value ? "bg-[#0D0D0D] text-white" : "bg-white text-[#0D0D0D] border border-[#E5E5E5] hover:bg-[#F7F7F8]"
                }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
          Eroare la incarcare: {error}
        </div>
      )}

      {loading || !data ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (<Skeleton key={i} className="h-28" />))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <MetricCard label="Vizionari" value={formatNumber(data.summary.totalViews)} />
          <MetricCard label="Aprecieri" value={formatNumber(data.summary.totalLikes)} />
          <MetricCard label="Comentarii" value={formatNumber(data.summary.totalComments)} />
          <MetricCard label="Distribuiri" value={formatNumber(data.summary.totalShares)} />
          <MetricCard
            label="Castiguri"
            value={fmt(data.summary.totalEarningsCents, { sourceCurrency: data.summary.earningsCurrency as Currency })}
          />
          <MetricCard label="Urmaritori noi" value={formatNumber(data.summary.followersGained)} />
        </div>
      )}

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Clipuri publicate" value={formatNumber(data.summary.videosPublished)} />
          <MetricCard label="Rata finalizare" value={`${(data.summary.avgCompletionRate * 100).toFixed(1)}%`} />
          <MetricCard label="Rata conversie" value={`${(data.summary.conversionRate * 100).toFixed(2)}%`} />
          <MetricCard label="Salvari" value={formatNumber(data.summary.totalSaves)} />
        </div>
      )}

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="CTR produse" value={`${((data.summary.productCtr ?? 0) * 100).toFixed(2)}%`} />
          <MetricCard label="Click-uri produse" value={formatNumber(data.summary.productClicks ?? 0)} />
          <MetricCard
            label="Vanzari atribuite"
            value={fmt(data.summary.attributedSalesCents ?? 0, { sourceCurrency: data.summary.earningsCurrency as Currency })}
          />
          <MetricCard
            label="Fond creatori"
            value={fmt(data.summary.creatorFundCents ?? 0, { sourceCurrency: data.summary.earningsCurrency as Currency })}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5">
          <h3 className="text-sm font-black text-[#0D0D0D] mb-4">Vizionari in timp</h3>
          {loading || !data ? (
            <Skeleton className="h-64" />
          ) : data.viewsOverTime.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-[#6E6E80]">
              Niciun eveniment inregistrat.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={256}>
              <LineChart data={data.viewsOverTime}>
                <CartesianGrid stroke="#F0F0F0" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: "#0D0D0D", border: "none", borderRadius: 12, color: "#FFF", fontSize: 12 }}
                  labelStyle={{ color: "#FFF" }}
                />
                <Line type="monotone" dataKey="views" stroke="#0D0D0D" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5">
          <h3 className="text-sm font-black text-[#0D0D0D] mb-4">Castiguri in timp</h3>
          {loading || !data ? (
            <Skeleton className="h-64" />
          ) : data.earningsOverTime.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-[#6E6E80]">
              Nicio comisie aprobata.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={256}>
              <LineChart data={data.earningsOverTime}>
                <CartesianGrid stroke="#F0F0F0" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: "#0D0D0D", border: "none", borderRadius: 12, color: "#FFF", fontSize: 12 }}
                  formatter={(value) =>
                    formatCurrency(Number(value), { sourceCurrency: (data.summary.earningsCurrency || "RON") as Currency })
                  }
                />
                <Line type="monotone" dataKey="cents" stroke="#16A34A" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5">
        <h3 className="text-sm font-black text-[#0D0D0D] mb-4">Top 10 videoclipuri</h3>
        {loading || !data ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => (<Skeleton key={i} className="h-14" />))}</div>
        ) : sortedTop.length === 0 ? (
          <p className="text-sm text-[#6E6E80] py-8 text-center">Niciun clip publicat in aceasta perioada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-[#E5E5E5]">
                  <th className="py-2 pr-2 font-bold text-[#6E6E80]">Clip</th>
                  <th className={`py-2 px-2 font-bold cursor-pointer ${sortKey === "views" ? "text-[#0D0D0D]" : "text-[#6E6E80]"}`} onClick={() => setSortKey("views")}>Vizionari</th>
                  <th className={`py-2 px-2 font-bold cursor-pointer ${sortKey === "likes" ? "text-[#0D0D0D]" : "text-[#6E6E80]"}`} onClick={() => setSortKey("likes")}>Aprecieri</th>
                  <th className={`py-2 px-2 font-bold cursor-pointer text-right ${sortKey === "earnings" ? "text-[#0D0D0D]" : "text-[#6E6E80]"}`} onClick={() => setSortKey("earnings")}>Castiguri</th>
                </tr>
              </thead>
              <tbody>
                {sortedTop.map((v) => (
                  <tr key={v.id} className="border-b border-[#F0F0F0] hover:bg-[#F7F7F8] cursor-pointer">
                    <td className="py-2 pr-2">
                      <Link href={`/video/${v.id}`} className="flex items-center gap-3">
                        {v.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.thumbnail} alt="" className="w-12 h-16 object-cover rounded-md bg-[#E5E5E5]" />
                        ) : (
                          <div className="w-12 h-16 rounded-md bg-[#E5E5E5]" />
                        )}
                        <span className="font-bold text-[#0D0D0D] line-clamp-2">{v.title || "(fara titlu)"}</span>
                      </Link>
                    </td>
                    <td className="py-2 px-2 tabular-nums">{formatNumber(v.views)}</td>
                    <td className="py-2 px-2 tabular-nums">{formatNumber(v.likes)}</td>
                    <td className="py-2 px-2 tabular-nums text-right">
                      {fmt(v.earningsCents, { sourceCurrency: (data.summary.earningsCurrency || "RON") as Currency })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5">
          <h3 className="text-sm font-black text-[#0D0D0D] mb-4">Top tari</h3>
          {!data || data.audienceTopCountries.length === 0 ? (
            <p className="text-sm text-[#6E6E80] py-8 text-center">
              Coming soon - colectam geo-locatie in pipeline-ul de evenimente.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.audienceTopCountries.map((c) => (
                <li key={c.country} className="flex items-center justify-between text-sm">
                  <span className="font-bold text-[#0D0D0D]">{c.country}</span>
                  <span className="text-[#6E6E80] tabular-nums">{c.percentage}%</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5">
          <h3 className="text-sm font-black text-[#0D0D0D] mb-4">Varsta</h3>
          {!data || data.audienceAgeBuckets.length === 0 ? (
            <p className="text-sm text-[#6E6E80] py-8 text-center">
              Coming soon - necesita analytics pipeline cu date demografice.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.audienceAgeBuckets.map((b) => (
                <li key={b.bucket} className="flex items-center justify-between text-sm">
                  <span className="font-bold text-[#0D0D0D]">{b.bucket}</span>
                  <span className="text-[#6E6E80] tabular-nums">{b.percentage}%</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
