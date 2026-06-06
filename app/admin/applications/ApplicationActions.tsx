"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export default function ApplicationActions({ applicationId }: { applicationId: string }) {
  const t = useTranslations("applicationsApplicationActions");
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "approve" | "reject") {
    if (action === "reject" && !reason.trim()) {
      setError("Adaugă un motiv pentru respingere.");
      return;
    }
    if (!confirm(action === "approve" ? "Aprobi aplicația? Userul va primi rolul de creator." : "Respingi aplicația?")) return;
    setLoading(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/applications/${applicationId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `Eroare ${res.status}`);
        setLoading(null);
        return;
      }
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Eroare de rețea");
      setLoading(null);
    }
  }

  return (
    <div>
      <label className="block text-xs font-bold text-black/60 uppercase mb-1">{t("motivObligatoriuPentruRespingere")}</label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        maxLength={500}
        className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm mb-2"
        placeholder={t("notaPentruJurnalSau")}
      />
      {error && (
        <div className="mb-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => run("approve")}
          className="rounded-lg bg-green-600 text-white px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {loading === "approve" ? "..." : "Aprobă"}
        </button>
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => run("reject")}
          className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {loading === "reject" ? "..." : "Respinge"}
        </button>
      </div>
    </div>
  );
}
