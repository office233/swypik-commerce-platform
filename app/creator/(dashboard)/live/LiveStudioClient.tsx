"use client";
import { useState } from "react";
import Link from "next/link";
import { Copy, Plus, Radio, Square } from "lucide-react";

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
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Radio className="w-6 h-6 text-red-500" /> Live Studio</h1>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-lg">
          <Plus className="w-4 h-4" /> Stream nou
        </button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold mb-4">Programează stream</h2>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titlu" className="w-full border rounded px-3 py-2 mb-3" />
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descriere" className="w-full border rounded px-3 py-2 mb-3" rows={3} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2">Renunță</button>
              <button onClick={onCreate} disabled={busy} className="bg-violet-600 text-white px-4 py-2 rounded disabled:opacity-50">Creează</button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {list.length === 0 && <p className="text-gray-500">Niciun stream încă. Apasă „Stream nou&rdquo;.</p>}
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
                    <button onClick={() => copy(s.rtmp_url)} className="p-1"><Copy className="w-3 h-3" /></button>
                  </div>
                </div>
                <div>
                  <div className="text-gray-600">Stream Key:</div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-[11px] flex-1 truncate">{s.stream_key}</code>
                    <button onClick={() => copy(s.stream_key)} className="p-1"><Copy className="w-3 h-3" /></button>
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 mt-3 text-sm">
              <Link href={`/live/${s.id}`} className="text-violet-600 underline">Vezi pagina</Link>
              {s.status === "live" && <span>👁 {s.viewer_count} viewers</span>}
              {s.status === "live" && (
                <button onClick={() => onEnd(s.id)} className="ml-auto flex items-center gap-1 text-red-600">
                  <Square className="w-3 h-3" /> Termină
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
