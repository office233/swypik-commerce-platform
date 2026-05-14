"use client";

import { useState } from "react";

export default function OrderReturnButton({
  orderId,
  lookupToken,
}: {
  orderId: string;
  lookupToken: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        body: JSON.stringify({ reason, token: lookupToken }),
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
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => setOpen(false)}
          className="flex-1 rounded-lg border border-white/15 py-2 text-sm"
        >
          Renunță
        </button>
        <button
          onClick={submit}
          disabled={submitting}
          className="flex-1 rounded-lg bg-pink-500 text-white py-2 text-sm font-bold disabled:opacity-50"
        >
          {submitting ? "Se trimite..." : "Trimite cerere"}
        </button>
      </div>
    </div>
  );
}
