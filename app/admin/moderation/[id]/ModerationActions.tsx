"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

type Props = {
  reportId: string;
  videoId: string | null;
  creatorId: string | null;
};

export default function ModerationActions({ reportId, videoId, creatorId }: Props) {
    const t = useTranslations("adminModeration");
  const router = useRouter();
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: string, confirmMsg: string, doubleConfirm = false) {
    if (!confirm(confirmMsg)) return;
    if (doubleConfirm && !confirm("Ești absolut sigur? Această acțiune este permanentă.")) return;
    setLoading(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/moderation/${reportId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `Eroare ${res.status}`);
        setLoading(null);
        return;
      }
      router.push("/admin/moderation");
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Eroare de rețea");
      setLoading(null);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-black/10 p-4">
      <h2 className="font-bold mb-3">{t("actionsTitle")}</h2>
      <label className="block text-sm font-bold mb-1">{t("internalReason")}</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={500}
        className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm mb-3"
        placeholder={t("journalPlaceholder")}
      />
      {error && (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => run("dismiss", "Respingi raportul? (nu se aplică nicio sancțiune)")}
          className="rounded-lg border border-black/15 px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {loading === "dismiss" ? "..." : "Respinge raport"}
        </button>
        <button
          type="button"
          disabled={loading !== null || !videoId}
          onClick={() => run("hide-video", "Ascunzi videoul din feed?")}
          className="rounded-lg bg-orange-500 text-white px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {loading === "hide-video" ? "..." : "Ascunde video"}
        </button>
        <button
          type="button"
          disabled={loading !== null || !creatorId}
          onClick={() =>
            run("ban-creator", "Suspenzi creatorul pentru 7 zile?")
          }
          className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {loading === "ban-creator" ? "..." : "Banează creator 7 zile"}
        </button>
        <button
          type="button"
          disabled={loading !== null || !videoId}
          onClick={() =>
            run("delete-video", "Elimini permanent videoul?", true)
          }
          className="rounded-lg bg-black text-white px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {loading === "delete-video" ? "..." : "Elimină permanent"}
        </button>
      </div>
    </div>
  );
}
