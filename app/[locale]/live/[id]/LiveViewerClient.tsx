"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Eye, ShoppingBag } from "lucide-react";

type Stream = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  hls_url: string | null;
  viewer_count: number;
  creator_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};
type Item = {
  id: number;
  product_id: string;
  is_pinned: boolean;
  flash_price_cents: number | null;
  flash_until: string | null;
  title: string | null;
  image_url: string | null;
  price_cents: number | null;
  currency: string | null;
};
type ChatMsg = { id: number; user_id: string; message: string; created_at: string };

export default function LiveViewerClient({ stream, items }: { stream: Stream; items: Item[] }) {
  const t = useTranslations("liveViewer");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [viewers, setViewers] = useState(stream.viewer_count);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [showDrawer, setShowDrawer] = useState(false);
  const pinned = items.find((i) => i.is_pinned) || items[0];

  // HLS init
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream.hls_url) return;
    let hls: any;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = stream.hls_url;
    } else {
      import("hls.js").then(({ default: Hls }) => {
        if (Hls.isSupported()) {
          hls = new Hls();
          hls.loadSource(stream.hls_url!);
          hls.attachMedia(video);
        }
      });
    }
    return () => { if (hls) hls.destroy(); };
  }, [stream.hls_url]);

  // Poll viewers
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/live/streams/${stream.id}`);
        if (r.ok) {
          const data = await r.json();
          if (data.stream?.viewer_count != null) setViewers(data.stream.viewer_count);
        }
      } catch { }
    }, 10_000);
    return () => clearInterval(t);
  }, [stream.id]);

  // Chat SSE
  useEffect(() => {
    const es = new EventSource(`/api/live/streams/${stream.id}/chat`);
    es.addEventListener("chat", (e: MessageEvent) => {
      try {
        const m = JSON.parse(e.data) as ChatMsg;
        setMessages((prev) => [...prev.slice(-99), m]);
      } catch { }
    });
    return () => es.close();
  }, [stream.id]);

  async function sendMessage() {
    const txt = input.trim();
    if (!txt) return;
    setInput("");
    await fetch(`/api/live/streams/${stream.id}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: txt }),
    });
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col lg:flex-row"><h1 className="sr-only">Live stream</h1>
      <div className="flex-1 relative">
        <video ref={videoRef} controls autoPlay playsInline className="w-full h-full object-contain" />
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className="bg-red-600 text-xs px-2 py-1 rounded font-bold">LIVE</span>
          <span className="inline-flex items-center gap-1 bg-black/60 text-xs px-2 py-1 rounded"><Eye size={12} /> {viewers}</span>
        </div>
        <div className="absolute top-3 right-3 bg-black/60 px-3 py-1 rounded text-sm">
          {stream.display_name || stream.username || "Creator"}
        </div>
        {pinned && (
          <div className="absolute bottom-4 left-4 right-4 bg-white text-black rounded-xl p-3 flex items-center gap-3 shadow-lg">
            {pinned.image_url && <Image src={pinned.image_url} alt="" width={56} height={56} className="h-14 w-14 rounded object-cover" unoptimized />}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{pinned.title}</div>
              <div className="text-xs">
                {pinned.flash_price_cents != null ? (
                  <>
                    <span className="text-red-600 font-bold">{(pinned.flash_price_cents / 100).toFixed(2)} {pinned.currency}</span>
                    {pinned.price_cents != null && (
                      <span className="text-gray-400 line-through ml-2">{(pinned.price_cents / 100).toFixed(2)}</span>
                    )}
                  </>
                ) : (
                  pinned.price_cents != null && <span>{(pinned.price_cents / 100).toFixed(2)} {pinned.currency}</span>
                )}
              </div>
            </div>
            <Link href={`/product/${pinned.product_id}`} className="inline-flex items-center justify-center bg-violet-600 hover:bg-violet-700 text-white px-5 py-3 min-h-[44px] rounded-lg text-sm font-semibold focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none">{t("buy")}</Link>
          </div>
        )}
        {items.length > 1 && (
          <button onClick={() => setShowDrawer(true)} className="absolute bottom-24 right-4 inline-flex items-center justify-center bg-violet-600 hover:bg-violet-700 text-white px-4 py-3 min-h-[44px] rounded-lg text-sm font-semibold shadow-lg focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none" aria-label={t("seeProducts")}>
            <ShoppingBag size={15} className="mr-1.5" /> {t("productCount", { count: items.length })}
          </button>
        )}
      </div>

      <aside className="lg:w-80 w-full lg:h-screen h-64 border-l border-white/10 flex flex-col">
        <div className="p-3 border-b border-white/10 font-semibold text-sm">Chat</div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1 text-sm">
          {messages.map((m) => (
            <div key={m.id}>
              <span className="text-violet-400 mr-1">user</span>{m.message}
            </div>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="p-2 border-t border-white/10 flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Mesaj…" aria-label="Mesaj chat" className="flex-1 bg-white/10 px-3 py-2 min-h-[40px] rounded-lg text-sm focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none" />
          <button type="submit" className="inline-flex items-center justify-center bg-violet-600 hover:bg-violet-700 text-white px-4 min-h-[40px] rounded-lg text-sm font-semibold focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none">Trimite</button>
        </form>
      </aside>

      {showDrawer && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end" onClick={() => setShowDrawer(false)}>
          <div className="bg-white text-black w-full rounded-t-2xl p-4 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold mb-3 text-base">Produse</h2>
            <div className="space-y-2">
              {items.map((it) => (
                <Link key={it.id} href={`/product/${it.product_id}`} className="flex items-center gap-3 border rounded p-2">
                  {it.image_url && <Image src={it.image_url} alt="" width={48} height={48} className="h-12 w-12 rounded object-cover" unoptimized />}
                  <div className="flex-1 text-sm">
                    <div className="font-medium">{it.title}</div>
                    <div className="text-xs text-gray-600">{it.price_cents != null && `${(it.price_cents / 100).toFixed(2)} ${it.currency}`}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
