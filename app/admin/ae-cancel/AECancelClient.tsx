"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export default function AECancelClient({ itemId }: { itemId: string }) {
  const t = useTranslations("aecancelAECancel");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"cancelled" | "uncancelable">("cancelled");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function submit() {
    setError(null);
    try {
      const res = await fetch("/api/admin/ae-cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, note, status }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setError(data?.error || `Eroare HTTP ${res.status}`);
        return;
      }
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (e: any) {
      setError(e?.message || "Eroare necunoscută");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-bold bg-[#0D0D0D] text-white hover:bg-black transition"
      >

        {t("marcheazaRezolvat")}
      </button>
    );
  }

  return (
    <div className="text-left bg-gray-50 border border-[#E5E5E5] rounded-lg p-3 space-y-2 min-w-[280px]">
      <div className="flex gap-2 text-xs">
        <label className="inline-flex items-center gap-1 cursor-pointer">
          <input
            type="radio"
            name={`status-${itemId}`}
            checked={status === "cancelled"}
            onChange={() => setStatus("cancelled")}
          />
          <span>{t("anulatLaAe")}</span>
        </label>
        <label className="inline-flex items-center gap-1 cursor-pointer">
          <input
            type="radio"
            name={`status-${itemId}`}
            checked={status === "uncancelable"}
            onChange={() => setStatus("uncancelable")}
          />
          <span>AE a refuzat</span>
        </label>
      </div>
      <textarea
        rows={2}
        placeholder={t("notaOptionalMax500")}
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
        className="w-full text-xs px-2 py-1.5 border border-[#E5E5E5] rounded resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
      />
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          disabled={pending}
          className="px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-200 transition"
        >

          {t("renunta")}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-bold bg-[#0D0D0D] text-white hover:bg-black transition disabled:opacity-60"
        >
          {pending ? "Se salvează…" : "Confirmă"}
        </button>
      </div>
    </div>
  );
}
