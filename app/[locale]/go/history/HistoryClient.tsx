"use client";

/** /go/history — curse anterioare cu bon detaliat (expand pe tap). */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";

type RideRow = {
  id: string;
  status: string;
  vehicle_class: string;
  pickup_address: string;
  dropoff_address: string;
  estimated_fare_cents: number | null;
  final_fare_cents: number | null;
  currency: string;
  distance_km: string | null;
  duration_min: number | null;
  requested_at: string;
  completed_at: string | null;
  driver_name: string | null;
  driver_rating: string | null;
};

const STATUS_BADGE: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
  in_progress: "bg-blue-100 text-blue-700",
};

export default function HistoryClient() {
  const t = useTranslations("goHistory");
  const locale = useLocale();
  const [rides, setRides] = useState<RideRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/rides?limit=50", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? t("error"));
        return res.json();
      })
      .then((d) => setRides(d.rides))
      .catch((e) => setError(e.message));
  }, [t]);

  const fmt = (c: number | null, cur: string) => (c != null ? `${(c / 100).toFixed(2)} ${cur}` : "—");

  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg bg-neutral-50 p-4 pb-24">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-extrabold tracking-tight">{t("title")}</h1>
        <Link href="/go" className="rounded-2xl bg-neutral-900 px-4 py-2 text-[13px] font-bold text-white">
          {t("newRide")}
        </Link>
      </div>

      {error ? <p className="text-center text-[14px] text-red-600">{error}</p> : null}
      {rides === null && !error ? (
        <div className="flex justify-center py-12">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900" />
        </div>
      ) : null}
      {rides?.length === 0 ? (
        <p className="py-12 text-center text-[14px] text-neutral-500">{t("empty")}</p>
      ) : null}

      <ul className="space-y-2">
        {rides?.map((r) => {
          const expanded = open === r.id;
          const isActive = !["completed", "cancelled"].includes(r.status);
          return (
            <li key={r.id} className="rounded-2xl border border-neutral-200 bg-white">
              <button
                type="button"
                className="w-full p-3 text-left"
                onClick={() => setOpen(expanded ? null : r.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[14px] font-bold">
                    {r.pickup_address.split(",")[0]} → {r.dropoff_address.split(",")[0]}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_BADGE[r.status] ?? "bg-neutral-100 text-neutral-600"}`}>
                    {r.status}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[12px] text-neutral-500">
                  <span>{new Date(r.requested_at).toLocaleString(locale)}</span>
                  <span className="font-bold text-neutral-900">
                    {fmt(r.final_fare_cents ?? r.estimated_fare_cents, r.currency)}
                  </span>
                </div>
              </button>

              {expanded ? (
                <div className="border-t border-dashed border-neutral-200 p-3 text-[13px]">
                  <p className="font-semibold text-neutral-400">{t("receipt")}</p>
                  <dl className="mt-1 space-y-1">
                    <div className="flex justify-between"><dt>{t("class")}</dt><dd className="font-semibold capitalize">{r.vehicle_class}</dd></div>
                    <div className="flex justify-between"><dt>{t("from")}</dt><dd className="max-w-[60%] truncate text-right">{r.pickup_address}</dd></div>
                    <div className="flex justify-between"><dt>{t("to")}</dt><dd className="max-w-[60%] truncate text-right">{r.dropoff_address}</dd></div>
                    {r.distance_km ? (
                      <div className="flex justify-between"><dt>{t("distance")}</dt><dd>{Number(r.distance_km).toFixed(1)} km</dd></div>
                    ) : null}
                    {r.duration_min ? (
                      <div className="flex justify-between"><dt>{t("duration")}</dt><dd>{r.duration_min} min</dd></div>
                    ) : null}
                    {r.driver_name ? (
                      <div className="flex justify-between">
                        <dt>{t("driver")}</dt>
                        <dd>{r.driver_name}{r.driver_rating ? ` (★ ${Number(r.driver_rating).toFixed(2)})` : ""}</dd>
                      </div>
                    ) : null}
                    <div className="flex justify-between border-t border-neutral-100 pt-1 font-extrabold">
                      <dt>{t("total")}</dt>
                      <dd>{fmt(r.final_fare_cents ?? r.estimated_fare_cents, r.currency)}</dd>
                    </div>
                  </dl>
                  {isActive ? (
                    <Link href={`/go/${r.id}`} className="mt-2 block rounded-2xl bg-neutral-900 py-2 text-center text-[13px] font-bold text-white">
                      {t("viewLive")}
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
