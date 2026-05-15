"use client";

import { useRef, useState } from "react";
import { X, Camera } from "lucide-react";

const MAX_PHOTOS = 4;

type UploadedPhoto = { url: string; key: string };

export default function OrderReturnButton({
  orderId,
  lookupToken,
}: {
  orderId: string;
  lookupToken: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
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
    if (reason.trim().length < 5) {
      setError("Te rugăm să descrii motivul (minim 5 caractere).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          token: lookupToken,
          evidenceUrls: photos.map((p) => p.url),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Eroare la trimiterea cererii.");
      } else {
        setDone(true);
      }
    } catch {
      setError("Eroare de rețea.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-300">
        Cererea de retur a fost înregistrată. Te vom contacta în curând.
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] py-3 text-sm font-semibold"
      >
        Solicită retur
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <label className="text-sm font-semibold">Motivul returului</label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={4}
        placeholder="Descrie problema (defect, mărime greșită etc.)..."
        className="mt-2 w-full rounded-lg bg-black/40 border border-white/15 p-3 text-sm"
      />

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">
            Fotografii (opțional, max {MAX_PHOTOS})
          </span>
          <span className="text-xs text-white/40">{photos.length}/{MAX_PHOTOS}</span>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {photos.map((p, i) => (
            <div key={p.key} className="relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`Evidență ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white hover:bg-black"
                aria-label="Șterge fotografia"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-white/20 bg-white/[0.02] text-white/50 hover:bg-white/[0.06] disabled:opacity-50"
              aria-label="Adaugă fotografie"
            >
              <Camera size={20} />
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        {uploading && <p className="mt-2 text-xs text-white/50">Se încarcă...</p>}
      </div>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => setOpen(false)}
          className="flex-1 rounded-lg border border-white/15 py-2 text-sm"
        >
          Renunță
        </button>
        <button
          onClick={submit}
          disabled={submitting || uploading}
          className="flex-1 rounded-lg bg-pink-500 text-white py-2 text-sm font-bold disabled:opacity-50"
        >
          {submitting ? "Se trimite..." : "Trimite cerere"}
        </button>
      </div>
    </div>
  );
}
