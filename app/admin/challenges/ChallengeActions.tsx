"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const NEXT_STATUS: Record<string, { label: string; to: string } | null> = {
  draft: { label: "Activează", to: "active" },
  active: { label: "Finalizează", to: "completed" },
  completed: null,
  cancelled: null,
};

export default function ChallengeActions({
  id,
  status,
  featured,
}: {
  id: string;
  status: string;
  featured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/challenges", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
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

  const next = NEXT_STATUS[status] ?? null;

  return (
    <div className="flex gap-1 justify-end">
      <button
        type="button"
        disabled={busy}
        onClick={() => patch({ featured: !featured })}
        className="text-[10px] font-black uppercase px-2 py-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-50"
        title={featured ? "Scoate de pe featured" : "Marchează ca featured"}
      >
        {featured ? "★ unfeat" : "☆ feat"}
      </button>
      {next && (
        <button
          type="button"
          disabled={busy}
          onClick={() => patch({ status: next.to })}
          className="text-[10px] font-black uppercase px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
        >
          {next.label}
        </button>
      )}
      {status !== "cancelled" && status !== "completed" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!confirm("Sigur anulezi challenge-ul?")) return;
            patch({ status: "cancelled" });
          }}
          className="text-[10px] font-black uppercase px-2 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-50"
        >
          Anulează
        </button>
      )}
    </div>
  );
}
