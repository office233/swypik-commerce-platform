"use client";
import { useState } from "react";
import Link from "next/link";
import { Copy, Plus, Radio, Square } from "lucide-react";
import { useTranslations } from "next-intl";

type Stream = {
  id: string;
  title: string;
  status: "scheduled" | "live" | "ended" | "failed";
  stream_key: string;
  rtmp_url: string;
  hls_url: string;
  viewer_count: number;
  peak_viewers: number;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
};

export default function LiveStudioClient({ streams }: { streams: Stream[] }) {
  const t = useTranslations("liveStudio");
  const [list, setList] = useState<Stream[]>(streams);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/live/streams", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: desc.trim() || null }),
      });
      if (r.ok) {
        const data = await r.json();
        setList((prev) => [{ ...data, title: title.trim(), status: "scheduled", viewer_count: 0, peak_viewers: 0, scheduled_at: null, started_at: null, ended_at: null }, ...prev]);
        setTitle(""); setDesc(""); setShowCreate(false);
      }
    } finally { setBusy(false); }
  }

  async function onEnd(id: string) {
    if (!confirm("Termini stream-ul?")) return;
    const r = await fetch(`/api/live/streams/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "ended" }),
    });
    if (r.ok) setList((p) => p.map((s) => (s.id === id ? { ...s, status: "ended" as const } : s)));
  }

  function copy(value: string) {
    navigator.clipboard.writeText(value).then(() => alert("Copiat!"));
  }

  return (
    <div className="px-4 md:px-6 py-6 max-w-5xl mx-auto pb-[max(24px,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-black text-[#0D0D0D] flex items-center gap-2"><Radio className="w-6 h-6 text-red-500" /> Live Studio</h1>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          aria-label={t("creeazaStreamNou")}
          className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2.5 min-h-[44px] rounded-lg text-sm font-bold focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:outline-none transition"
        >
          <Plus className="w-4 h-4" /> Stream nou
        </button>
      </div>

      {showCreate && (
        <div role="dialog" aria-modal="true" aria-labelledby="live-create-title" className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 id="live-create-title" className="font-semibold mb-4">{t("programeazaStream")}</h2>
            <label className="sr-only" htmlFor="live-title">Titlu</label>
            <input id="live-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titlu" className="w-full border rounded-lg px-3 py-2.5 mb-3 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none" />
            <label className="sr-only" htmlFor="live-desc">Descriere</label>
            <textarea id="live-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descriere" className="w-full border rounded-lg px-3 py-2.5 mb-3 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none" rows={3} />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2.5 min-h-[44px] rounded-lg text-sm font-bold text-[#0D0D0D] hover:bg-[#F7F7F8]">{t("renunta")}</button>
              <button type="button" onClick={onCreate} disabled={busy} className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2.5 min-h-[44px] rounded-lg text-sm font-bold disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none">{t("creeaza")}</button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {list.length === 0 && <p className="text-gray-500">{t("niciunStreamIncaApasa")}</p>}
        {list.map((s) => (
          <div key={s.id} className="border rounded-xl p-4 bg-white">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">{s.title}</div>
              <span className={`text-xs px-2 py-1 rounded ${s.status === "live" ? "bg-red-100 text-red-700" : s.status === "ended" ? "bg-gray-100 text-gray-600" : "bg-yellow-100 text-yellow-700"}`}>
                {s.status.toUpperCase()}
              </span>
            </div>
            {s.status !== "ended" && (
              <div className="text-xs space-y-2 bg-gray-50 p-3 rounded">
                <div>
                  <div className="text-gray-600">RTMP URL (OBS → Settings → Stream → Custom):</div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-[11px] flex-1 truncate">{s.rtmp_url}</code>
                    <button type="button" aria-label={t("copiazaUrlRtmp")} onClick={() => copy(s.rtmp_url)} className="w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-[#F7F7F8] focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"><Copy className="w-4 h-4" /></button>
                  </div>
                </div>
                <div>
                  <div className="text-gray-600">Stream Key:</div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-[11px] flex-1 truncate">{s.stream_key}</code>
                    <button type="button" aria-label={t("copiazaStreamKey")} onClick={() => copy(s.stream_key)} className="w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-[#F7F7F8] focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"><Copy className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 mt-3 text-sm">
              <Link href={`/live/${s.id}`} className="text-violet-600 underline">Vezi pagina</Link>
              {s.status === "live" && <span>👁 {s.viewer_count} viewers</span>}
              {s.status === "live" && (
                <button type="button" onClick={() => onEnd(s.id)} className="ml-auto inline-flex items-center gap-1 min-h-[40px] px-3 rounded-lg text-red-600 hover:bg-red-50 font-bold text-sm focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none">
                  <Square className="w-3 h-3" />  {t("termina")}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
