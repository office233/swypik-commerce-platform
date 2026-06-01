"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";

export type ReviewFormProps = {
  productId: string;
};

export default function ReviewForm({ productId }: ReviewFormProps) {
  const router = useRouter();
  const t = useTranslations("reviewForm");
  const [rating, setRating] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (rating < 1 || rating > 5) {
      setError(t("errRating"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/products/${productId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, title: title || null, body: body || null }),
      });
      if (res.status === 401) {
        setError(t("errAuth"));
      } else if (res.status === 409) {
        setError(t("errDeja"));
      } else if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || t("errGenerica"));
      } else {
        setTitle("");
        setBody("");
        setRating(0);
        router.refresh();
      }
    } catch (err) {
      setError(t("errRetea"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 border rounded-lg p-4">
      <div>
        <label className="block text-sm font-medium mb-1">{t("labelRating")}</label>
        <div className="flex gap-1" role="radiogroup" aria-label={t("ariaRating")}>
          {[1, 2, 3, 4, 5].map((n) => {
            const active = (hover || rating) >= n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={t("ariaStele", { n })}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setRating(n)}
                className="p-1"
              >
                <Star size={28} className={active ? "fill-yellow-400 text-yellow-400" : "text-gray-300"} />
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label htmlFor="review-title" className="block text-sm font-medium mb-1">
          {t("labelTitlu")}
        </label>
        <input
          id="review-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className="w-full border rounded px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="review-body" className="block text-sm font-medium mb-1">
          {t("labelParere")}
        </label>
        <textarea
          id="review-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={4000}
          className="w-full border rounded px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting || rating < 1}
        className="bg-violet-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
      >
        {submitting ? t("btnSeTrimite") : t("btnTrimite")}
      </button>
    </form>
  );
}
