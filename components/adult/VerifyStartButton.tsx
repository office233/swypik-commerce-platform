"use client";

import { useState } from "react";

export default function VerifyStartButton() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/adult/access/verify", { method: "POST" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(data?.message || data?.error || `HTTP ${r.status}`);
        setLoading(false);
        return;
      }
      if (data?.hostedUrl) {
        window.location.href = data.hostedUrl;
        return;
      }
      setErr("No verification URL returned.");
      setLoading(false);
    } catch (e: any) {
      setErr(String(e?.message || e));
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={start}
        disabled={loading}
        className="rounded bg-rose-600 px-6 py-3 font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
      >
        {loading ? "Opening verification…" : "Start age verification"}
      </button>
      {err && <p className="text-sm text-rose-300">{err}</p>}
    </div>
  );
}
