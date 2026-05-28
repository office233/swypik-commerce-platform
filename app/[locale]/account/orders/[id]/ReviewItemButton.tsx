"use client";

import { useState } from "react";
import { Star } from "lucide-react";

const MAX_BODY = 1000;

export default function ReviewItemButton({
  productId,
  alreadyReviewed,
}: {
  productId: string;
  alreadyReviewed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(alreadyReviewed);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-400">
        <Star size={12} className="fill-emerald-400" /> Recenzie trimisă
      </div>
    );
  }

  async function handleSubmit() {
    if (rating < 1 || rating > 5) {
      setError("Selectează un rating între 1 și 5 stele.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, body: body.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          setDone(true);
          return;
        }
        setError(data?.error === "invalid_rating" ? "Rating invalid." : "Eroare la trimitere.");
        return;
      }
      setDone(true);
      setOpen(false);
    } catch {
      setError("Eroare de rețea. Încearcă din nou.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[11px] font-bold text-white hover:bg-white/10 transition"
      >
        <Star size={12} /> Lasă o recenzie
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-center gap-1 mb-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(n)}
            className="p-0.5"
            aria-label={`${n} stele`}
          >
            <Star
              size={22}
              className={
                (hover || rating) >= n
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-white/30"
              }
            />
          </button>
        ))}
      </div>
      <textarea
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
        placeholder="Spune-ne cum ți s-a părut produsul (opțional)"
        className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-white/30 resize-none"
      />
      <div className="mt-1 text-[10px] text-white/40 text-right">
        {body.length}/{MAX_BODY}
      </div>
      {error && (
        <p className="mt-1 text-xs font-bold text-red-400">{error}</p>
      )}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || rating < 1}
          className="flex-1 rounded-lg bg-white px-3 py-2 text-xs font-bold text-black disabled:opacity-40 transition"
        >
          {submitting ? "Se trimite..." : "Trimite recenzia"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/5 transition"
        >
          Anulează
        </button>
      </div>
    </div>
  );
}
