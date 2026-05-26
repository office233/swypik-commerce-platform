"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function RevokeStrikeButton({ strikeId }: { strikeId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function revoke() {
    const notes = window.prompt("Motiv revocare (opțional):", "");
    if (notes === null) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/strikes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strikeId, notes: notes || undefined }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(`Eroare: ${j.error || r.status}`);
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={revoke}
      disabled={busy}
      className="text-[10px] font-black uppercase px-2 py-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-50"
    >
      {busy ? "..." : "Revocă"}
    </button>
  );
}
