"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Camera, Check } from "lucide-react";
import { useTranslations } from "next-intl";

const MAX_PHOTOS = 4;

type Item = {
  id: string;
  title: string;
  quantity: number;
  unit_amount_cents: number;
  currency: string;
};

type Selected = { qty: number };
type UploadedPhoto = { url: string; key: string };

export default function ReturnFormClient({
  orderId,
  lookupToken,
  items,
}: {
  orderId: string;
  lookupToken: string | null;
  items: Item[];
}) {
  const t = useTranslations("returnForm");
  const router = useRouter();
  const [selection, setSelection] = useState<Record<string, Selected>>({});
  const [reason, setReason] = useState("");
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fmt = (cents: number, cur: string) =>
    `${(cents / 100).toFixed(2)} ${cur}`;

  function toggleItem(item: Item) {
    setSelection((prev) => {
      const next = { ...prev };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = { qty: item.quantity };
      return next;
    });
  }

  function setQty(itemId: string, qty: number, max: number) {
    const safe = Math.max(1, Math.min(max, qty || 1));
    setSelection((prev) => ({ ...prev, [itemId]: { qty: safe } }));
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !lookupToken) return;
    setError(null);
    const remaining = MAX_PHOTOS - photos.length;
    const toUpload = Array.from(files).slice(0, remaining);
    if (toUpload.length === 0) {
      setError(`Maxim ${MAX_PHOTOS} fotografii.`);
      return;
    }
    setUploading(true);
    try {
      for (const f of toUpload) {
        const fd = new FormData();
        fd.append("token", lookupToken);
        fd.append("file", f);
        const res = await fetch(`/api/orders/${orderId}/return/photos`, {
          method: "POST",
          body: fd,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error || "Eroare la încărcarea fotografiei.");
          break;
        }
        setPhotos((prev) => [...prev, { url: json.url, key: json.key }]);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit() {
    setError(null);
    const selectedItems = Object.entries(selection).map(([item_id, s]) => ({
      item_id,
      qty: s.qty,
    }));
    if (selectedItems.length === 0) {
      setError("Selectează cel puțin un produs pentru retur.");
      return;
    }
    if (reason.trim().length < 10) {
      setError("Motivul trebuie să aibă minim 10 caractere.");
      return;
    }

    setSubmitting(true);
    try {
      const body: any = {
        reason: reason.trim(),
        items: selectedItems,
        evidenceUrls: photos.map((p) => p.url),
        photos: photos.map((p) => p.key),
      };
      if (lookupToken) body.token = lookupToken;
      const res = await fetch(`/api/orders/${orderId}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Eroare la trimiterea cererii.");
        setSubmitting(false);
        return;
      }
      router.replace(`/account/orders/${orderId}?return=requested`);
      router.refresh();
    } catch {
      setError("Eroare de rețea.");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] divide-y divide-white/5 overflow-hidden">
        <div className="px-4 py-3 bg-white/[0.02]">
          <h2 className="text-sm font-bold">{t("produsePentruRetur")}</h2>
          <p className="text-xs text-white/50 mt-0.5">
            
            {t("bifeazaProduseleSiAlege")}
          </p>
        </div>
        {items.map((it) => {
          const sel = selection[it.id];
          const checked = !!sel;
          return (
            <label
              key={it.id}
              className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02]"
            >
              <span
                className={`mt-1 w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                  checked
                    ? "bg-white border-white text-black"
                    : "border-white/30 bg-transparent"
                }`}
                aria-hidden="true"
              >
                {checked && <Check size={14} strokeWidth={3} />}
              </span>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleItem(it)}
                className="sr-only"
                aria-label={`Selectează ${it.title}`}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold line-clamp-2">{it.title}</div>
                <div className="text-xs text-white/50 mt-0.5">
                  Comandat: {it.quantity} × {fmt(it.unit_amount_cents, it.currency)}
                </div>
                {checked && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-white/60">Cantitate retur:</span>
                    <div className="inline-flex items-center rounded-lg border border-white/15 overflow-hidden">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setQty(it.id, (sel?.qty || 1) - 1, it.quantity);
                        }}
                        className="px-2 py-1 text-sm hover:bg-white/10"
                        aria-label="Scade cantitate"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={it.quantity}
                        value={sel?.qty || 1}
                        onChange={(e) =>
                          setQty(it.id, parseInt(e.target.value, 10) || 1, it.quantity)
                        }
                        onClick={(e) => e.preventDefault()}
                        className="w-12 bg-transparent text-center text-sm py-1 outline-none"
                        aria-label="Cantitate retur"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setQty(it.id, (sel?.qty || 1) + 1, it.quantity);
                        }}
                        className="px-2 py-1 text-sm hover:bg-white/10"
                        aria-label={t("cresteCantitate")}
                      >
                        +
                      </button>
                    </div>
                    <span className="text-xs text-white/40">/ {it.quantity}</span>
                  </div>
                )}
              </div>
            </label>
          );
        })}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <label htmlFor="return-reason" className="block text-sm font-bold mb-2">
          Motivul returului
        </label>
        <textarea
          id="return-reason"
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("descriePeScurtMotivul")}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 resize-none"
        />
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <h3 className="text-sm font-bold mb-2">{t("fotografiiOptionalMax")} {MAX_PHOTOS})</h3>
        <div className="grid grid-cols-4 gap-2">
          {photos.map((p, i) => (
            <div key={p.key} className="relative aspect-square rounded-lg overflow-hidden border border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`Dovada ${i + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center"
                aria-label="Sterge fotografie"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || !lookupToken}
              className="aspect-square rounded-lg border border-dashed border-white/20 flex flex-col items-center justify-center text-white/50 hover:bg-white/5 disabled:opacity-50"
              aria-label={t("adaugaFotografie")}
            >
              <Camera size={20} />
              <span className="text-[10px] mt-1">{uploading ? "..." : "Adauga"}</span>
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {!lookupToken && (
          <p className="mt-2 text-xs text-white/40">
            
            {t("tokenComandaLipsaFotografiile")}
          </p>
        )}
      </section>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="w-full rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-black hover:bg-white/90 disabled:opacity-50"
      >
        {submitting ? "Se trimite..." : "Trimite cererea de retur"}
      </button>
    </div>
  );
}
