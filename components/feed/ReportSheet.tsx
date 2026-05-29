"use client";

import { useEffect, useState } from "react";
import { X, Flag, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

type Category = "spam" | "explicit" | "harassment" | "misinformation" | "copyright" | "other";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "explicit", label: "Conținut explicit" },
  { value: "harassment", label: "Hărțuire" },
  { value: "misinformation", label: "Dezinformare" },
  { value: "copyright", label: "Drepturi de autor" },
  { value: "other", label: "Altul" },
];

type Props = {
  videoId: string;
  onClose: () => void;
  onSubmitted?: () => void;
};

export default function ReportSheet({ videoId, onClose, onSubmitted }: Props) {
  const t = useTranslations("reportSheet");
  const [category, setCategory] = useState<Category>("spam");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, details: details.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "Eroare la trimitere.");
        setSubmitting(false);
        return;
      }
      setToast("Mulțumim, am primit raportul.");
      onSubmitted?.();
      setTimeout(() => onClose(), 1200);
    } catch {
      setError("Eroare de rețea.");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-sheet-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="report-sheet-title" className="flex items-center gap-2 text-base font-black text-[#0D0D0D]">
            <Flag className="h-5 w-5 text-rose-500" />  {t("raporteazaVideoclip")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("inchide")}
            className="rounded-full p-1 hover:bg-[#F7F7F8]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-3 text-xs text-[#6E6E80]">{t("selecteazaMotivulRaportarii")}</p>

        <fieldset className="mb-4 space-y-1.5">
          <legend className="sr-only">Categorie raport</legend>
          {CATEGORIES.map((c) => (
            <label
              key={c.value}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#E5E5E5] px-3 py-2.5 text-sm font-medium text-[#0D0D0D] hover:bg-[#F7F7F8]"
            >
              <input
                type="radio"
                name="report-category"
                value={c.value}
                checked={category === c.value}
                onChange={() => setCategory(c.value)}
                className="h-4 w-4 accent-[#FE2C55]"
              />
              <span>{c.label}</span>
            </label>
          ))}
        </fieldset>

        <label htmlFor="report-details" className="mb-1.5 block text-sm font-bold text-[#0D0D0D]">
          
          {t("detaliiOptional")}
        </label>
        <textarea
          id="report-details"
          rows={3}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={1000}
          placeholder={t("adaugaContext")}
          className="w-full resize-none rounded-xl border border-[#E5E5E5] bg-[#F7F7F8] px-3 py-2.5 text-sm text-[#0D0D0D] placeholder-[#A1A1AA] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0D0D0D]"
        />

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-600">⚠️ {error}</p>
        )}
        {toast && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">✓ {toast}</p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#FE2C55] px-6 py-3 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitting ? "Se trimite..." : "Trimite raportul"}
        </button>
      </div>
    </div>
  );
}
