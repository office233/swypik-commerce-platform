"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

type ApplyResponse = {
  success?: boolean;
  role?: string;
  alreadyCreator?: boolean;
  error?: string;
};

export default function BecomeCreatorButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  async function handleApply() {
    if (loading) return;
    setLoading(true);
    setToast(null);
    try {
      const res = await fetch("/api/creator/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as ApplyResponse;
      if (res.ok && data.success) {
        setToast({
          msg: "Felicitări! Acum ești creator. Te redirecționăm...",
          kind: "ok",
        });
        setTimeout(() => router.push("/creator/upload"), 900);
      } else {
        setToast({
          msg: data.error || "Nu am putut activa contul de creator. Încearcă din nou.",
          kind: "err",
        });
        setLoading(false);
      }
    } catch {
      setToast({ msg: "Eroare de rețea. Încearcă din nou.", kind: "err" });
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleApply}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-gradient-to-r from-[#FE2C55] to-[#FF6B47] text-white font-bold text-base shadow-lg active:scale-[0.98] transition disabled:opacity-60 disabled:active:scale-100"
      >
        {loading ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Se activează...
          </>
        ) : (
          <>
            Devino creator <ArrowRight size={18} />
          </>
        )}
      </button>

      {toast && (
        <div
          className={`fixed left-1/2 bottom-24 z-50 -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-bold shadow-xl ${
            toast.kind === "ok" ? "bg-[#0D0D0D] text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </>
  );
}
