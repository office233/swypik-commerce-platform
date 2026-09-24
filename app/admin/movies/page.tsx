"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { MovieSeriesRow, SeriesStatus } from "@/lib/movies/types";

type Row = MovieSeriesRow & { episode_count: number; owner_name: string | null };
type Publisher = { user_id: string; display_name: string | null; username: string | null; email: string | null; note: string | null };
const STATUSES: SeriesStatus[] = ["pending_review", "draft", "published", "archived"];
const REQUEST_OPTS: RequestInit = { credentials: "same-origin", headers: { "Content-Type": "application/json" } };

type StatusKey = "statusDraft" | "statusPendingReview" | "statusPublished" | "statusArchived";
const STATUS_KEY: Record<SeriesStatus, StatusKey> = {
  draft: "statusDraft",
  pending_review: "statusPendingReview",
  published: "statusPublished",
  archived: "statusArchived",
};

export default function AdminMoviesPage() {
  const t = useTranslations("movies");
  const [status, setStatus] = useState<SeriesStatus>("pending_review");
  const [rows, setRows] = useState<Row[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [newPublisher, setNewPublisher] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/admin/movies?status=${status}`, REQUEST_OPTS)
      .then((r) => r.json())
      .then((d) => setRows(d.series ?? []))
      .catch(() => setMsg(t("error")));
    fetch("/api/admin/movies/publishers", REQUEST_OPTS)
      .then((r) => r.json())
      .then((d) => setPublishers(d.publishers ?? []))
      .catch(() => undefined);
  }, [status, t]);
  useEffect(load, [load]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/movies/${id}`, { ...REQUEST_OPTS, method: "PATCH", body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok ? t("saved") : `${t("error")} ${d.error ?? ""}`);
    load();
  };
  const approve = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/admin/movies/publishers", { ...REQUEST_OPTS, method: "POST", body: JSON.stringify({ userId: newPublisher.trim() }) });
    setMsg(res.ok ? t("saved") : t("error"));
    if (res.ok) {
      setNewPublisher("");
      load();
    }
  };

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-black">{t("adminTitle")}</h1>
      {msg && <p className="text-sm font-semibold">{msg}</p>}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)} className={`rounded-full px-3 py-1 text-xs font-bold ${status === s ? "bg-black text-white" : "bg-neutral-100"}`}>
            {t(STATUS_KEY[s])}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-neutral-500">
            <th>{t("tableSeries")}</th><th>{t("tableOwner")}</th><th>{t("tableEpisodes")}</th><th>{t("tableFree")}</th><th>{t("episodePrice")}</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="py-2 font-bold">
                {r.title}
                <div className="text-xs font-normal text-neutral-500">{r.slug}{r.license_note ? "" : ` · ${t("noLicenseNote")}`}</div>
              </td>
              <td>{r.owner_name ?? r.owner_user_id.slice(0, 8)}</td>
              <td>{r.episode_count}</td>
              <td>{r.free_episodes}</td>
              <td>{r.episode_price_units}</td>
              <td className="space-x-1 text-right whitespace-nowrap">
                {r.status !== "published" && (
                  <button type="button" onClick={() => patch(r.id, { status: "published" })} className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-bold text-white">{t("publish")}</button>
                )}
                {r.status === "published" && (
                  <button type="button" onClick={() => patch(r.id, { status: "archived" })} className="rounded-lg bg-neutral-800 px-2 py-1 text-xs font-bold text-white">{t("archive")}</button>
                )}
                {r.status !== "draft" && (
                  <button type="button" onClick={() => patch(r.id, { status: "draft" })} className="rounded-lg border px-2 py-1 text-xs font-bold">{t("backToDraft")}</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <section className="rounded-2xl border p-4">
        <h2 className="mb-2 font-black">{t("publishers")}</h2>
        <ul className="mb-3 space-y-1 text-sm">
          {publishers.map((p) => (
            <li key={p.user_id}>{p.display_name ?? p.username ?? p.email} <span className="text-xs text-neutral-500">{p.user_id}</span></li>
          ))}
        </ul>
        <form onSubmit={approve} className="flex flex-wrap gap-2">
          <input value={newPublisher} onChange={(e) => setNewPublisher(e.target.value)} placeholder={t("approvePublisher")} className="flex-1 min-w-0 rounded-xl border px-3 py-2 text-sm" />
          <button type="submit" className="rounded-xl bg-black px-4 py-2 text-sm font-bold text-white">{t("approveSubmit")}</button>
        </form>
      </section>
    </div>
  );
}
