"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

const TYPES = ["video", "review", "engagement", "commerce", "community"] as const;

function toLocalIso(d: Date) {
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function NewChallengeForm() {
  const t = useTranslations("challengesNewChallengeForm");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      title: String(fd.get("title") || "").trim(),
      description: String(fd.get("description") || "").trim() || null,
      challenge_type: String(fd.get("challenge_type") || "video"),
      topic: String(fd.get("topic") || "").trim() || null,
      reward_points: Number(fd.get("reward_points") || 50),
      max_entries: fd.get("max_entries") ? Number(fd.get("max_entries")) : null,
      starts_at: new Date(String(fd.get("starts_at"))).toISOString(),
      ends_at: new Date(String(fd.get("ends_at"))).toISOString(),
      featured: fd.get("featured") === "on",
    };
    if (!payload.title) {
      setError("Titlul e obligatoriu.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || `HTTP ${r.status}`);
        return;
      }
      (e.target as HTMLFormElement).reset();
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
      <label className="flex flex-col gap-1 md:col-span-2">
        <span className="text-[10px] uppercase text-white/50">Titlu</span>
        <input
          name="title"
          required
          className="rounded bg-black/30 border border-white/10 px-2 py-1.5"
        />
      </label>

      <label className="flex flex-col gap-1 md:col-span-2">
        <span className="text-[10px] uppercase text-white/50">Descriere</span>
        <textarea
          name="description"
          rows={2}
          className="rounded bg-black/30 border border-white/10 px-2 py-1.5"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase text-white/50">Tip</span>
        <select
          name="challenge_type"
          defaultValue="video"
          className="rounded bg-black/30 border border-white/10 px-2 py-1.5"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase text-white/50">Topic</span>
        <input
          name="topic"
          placeholder="ex: unboxing"
          className="rounded bg-black/30 border border-white/10 px-2 py-1.5"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase text-white/50">Reward (puncte)</span>
        <input
          type="number"
          name="reward_points"
          defaultValue={50}
          min={0}
          className="rounded bg-black/30 border border-white/10 px-2 py-1.5"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase text-white/50">{t("maxIntrariOpt")}</span>
        <input
          type="number"
          name="max_entries"
          min={1}
          className="rounded bg-black/30 border border-white/10 px-2 py-1.5"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase text-white/50">Start</span>
        <input
          type="datetime-local"
          name="starts_at"
          required
          defaultValue={toLocalIso(now)}
          className="rounded bg-black/30 border border-white/10 px-2 py-1.5"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase text-white/50">End</span>
        <input
          type="datetime-local"
          name="ends_at"
          required
          defaultValue={toLocalIso(in7d)}
          className="rounded bg-black/30 border border-white/10 px-2 py-1.5"
        />
      </label>

      <label className="flex items-center gap-2 md:col-span-2">
        <input type="checkbox" name="featured" />
        <span className="text-[11px]">Featured</span>
      </label>

      {error && (
        <div className="md:col-span-2 text-[11px] text-red-300 font-bold">{error}</div>
      )}

      <div className="md:col-span-2 flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 rounded bg-white text-black font-black text-xs uppercase disabled:opacity-50"
        >
          {busy ? "Creează..." : "Creează challenge"}
        </button>
      </div>
    </form>
  );
}
