"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Heart, MessageCircle, ShoppingCart, Share2, ChevronUp,
  Volume2, VolumeX, X, Star, Truck, Package,
  ChevronLeft, ChevronRight, Music, ArrowLeft,
} from "lucide-react";

type FeedProduct = {
  id: string; title: string; description: string; benefits: string[];
  dealLabel: string; whyBuy: string; warnings: string[];
  price: number; oldPrice: number; discountPercent: number;
  rating: number; orders: number; deliveryDays: number;
  images: string[]; category: string; gradient: string; qualityScore: number;
};

const COMMENTS = [
  { name: "Maria S.", avatar: "M", text: "Super calitate! L-am comandat de 2 ori 😍", time: "2h", color: "bg-pink-500/20 text-pink-400" },
  { name: "Andrei P.", avatar: "A", text: "A ajuns repede, exact ca în poze!", time: "5h", color: "bg-emerald-500/20 text-emerald-400" },
  { name: "Elena D.", avatar: "E", text: "Prețul e imbatabil 🔥", time: "8h", color: "bg-violet-500/20 text-violet-400" },
  { name: "Ionuț M.", avatar: "I", text: "Am luat pentru toată familia!", time: "1d", color: "bg-amber-500/20 text-amber-400" },
  { name: "Cristina R.", avatar: "C", text: "Calitate premium la preț mic!", time: "1d", color: "bg-cyan-500/20 text-cyan-400" },
  { name: "Vlad T.", avatar: "V", text: "Al 3-lea produs de aici 💪", time: "2d", color: "bg-orange-500/20 text-orange-400" },
];

const LIKE_BASE = [142, 89, 234, 56, 312, 178, 423, 67, 198, 345];

type Props = {
  products: FeedProduct[];
  onAddToCart: (p: FeedProduct) => void;
  onLoadMore?: () => void;
  onClose?: () => void;
  isLoading: boolean;
};

export default function ProductFeed({ products, onAddToCart, onLoadMore, onClose, isLoading }: Props) {
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [activeSheet, setActiveSheet] = useState<{ type: "comments" | "details"; idx: number } | null>(null);
  const [muted, setMuted] = useState(true);
  const [imgIndices, setImgIndices] = useState<Record<string, number>>({});
  const [heartBurst, setHeartBurst] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [visibleIdx, setVisibleIdx] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; id: string } | null>(null);

  // Init like counts
  useEffect(() => {
    const c: Record<string, number> = {};
    products.forEach((p, i) => { c[p.id] = c[p.id] || LIKE_BASE[i % LIKE_BASE.length]; });
    setLikeCounts(prev => ({ ...prev, ...c }));
  }, [products]);

  // Track visible product via IntersectionObserver
  useEffect(() => {
    if (!scrollRef.current) return;
    const cards = scrollRef.current.querySelectorAll("[data-feed-card]");
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const i = Number((e.target as HTMLElement).dataset.feedCard);
          if (!isNaN(i)) setVisibleIdx(i);
        }
      });
    }, { root: scrollRef.current, threshold: 0.6 });
    cards.forEach(c => obs.observe(c));
    return () => obs.disconnect();
  }, [products]);

  // Infinite scroll — trigger when sentinel visible
  useEffect(() => {
    if (!sentinelRef.current || !onLoadMore) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) onLoadMore();
    }, { root: scrollRef.current, threshold: 0.1 });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [onLoadMore, products.length]);

  // ── Ambient Music ──
  function startMusic() {
    if (audioCtxRef.current) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;
    const master = ctx.createGain();
    master.gain.value = 0.07;
    master.connect(ctx.destination);
    [261.63, 329.63, 392.0, 493.88].forEach((freq) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = freq; g.gain.value = 0.12;
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.type = "sine"; lfo.frequency.value = 0.25 + Math.random() * 0.15;
      lg.gain.value = 0.03; lfo.connect(lg); lg.connect(g.gain); lfo.start();
      osc.connect(g); g.connect(master); osc.start();
    });
    const kick = () => {
      if (!audioCtxRef.current || audioCtxRef.current.state !== "running") return;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(80, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.12);
      g.gain.setValueAtTime(0.06, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + 0.25);
    };
    const iv = setInterval(kick, 833);
    (ctx as any)._iv = iv;
  }
  function stopMusic() {
    if (audioCtxRef.current) {
      clearInterval((audioCtxRef.current as any)._iv);
      audioCtxRef.current.close(); audioCtxRef.current = null;
    }
  }
  useEffect(() => () => stopMusic(), []);
  const toggleMusic = () => { if (muted) { startMusic(); setMuted(false); } else { stopMusic(); setMuted(true); } };

  // Like
  const toggleLike = (id: string) => {
    const was = likes[id];
    setLikes(p => ({ ...p, [id]: !was }));
    setLikeCounts(p => ({ ...p, [id]: (p[id] || 0) + (was ? -1 : 1) }));
    if (!was) {
      setHeartBurst(id); setTimeout(() => setHeartBurst(null), 900);
      if (muted) { startMusic(); setMuted(false); }
    }
  };

  // Image index per product
  const getImgIdx = (id: string) => imgIndices[id] || 0;
  const setImgIdx = (id: string, i: number) => setImgIndices(p => ({ ...p, [id]: i }));

  // Horizontal swipe for photos
  const onCardTouchStart = (e: React.TouchEvent, productId: string) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, id: productId };
  };
  const onCardTouchEnd = (e: React.TouchEvent, product: FeedProduct) => {
    if (!touchStartRef.current || touchStartRef.current.id !== product.id) return;
    const dx = touchStartRef.current.x - e.changedTouches[0].clientX;
    const dy = touchStartRef.current.y - e.changedTouches[0].clientY;
    // Only horizontal swipe (more horizontal than vertical)
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const ci = getImgIdx(product.id);
      const maxIdx = (product.images?.length || 1) - 1;
      if (dx > 0 && ci < maxIdx) setImgIdx(product.id, ci + 1); // swipe left → next photo
      else if (dx < 0 && ci > 0) setImgIdx(product.id, ci - 1); // swipe right → prev photo
    }
    touchStartRef.current = null;
  };

  // ── Loading / empty ──
  if (isLoading && products.length === 0) {
    return (
      <div className="feed-scroll flex items-center justify-center">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-400 border-t-transparent mx-auto" />
          <p className="mt-4 text-sm text-white/40">Se încarcă produsele...</p>
        </div>
      </div>
    );
  }
  if (products.length === 0) {
    return (
      <div className="feed-scroll flex items-center justify-center">
        <div className="text-center px-8">
          <Package className="mx-auto mb-4 text-white/20" size={48} />
          <p className="text-white/50 font-bold">Încă nu sunt produse</p>
        </div>
      </div>
    );
  }

  const sizes = ["XS", "S", "M", "L", "XL", "XXL"];

  return (
    <>
      {/* ── Snap scroll container ── */}
      <div ref={scrollRef} className="feed-scroll">
        {products.map((product, pIdx) => {
          const ci = getImgIdx(product.id);
          const multiImg = product.images?.length > 1;
          const comments = COMMENTS.slice(0, 3 + (pIdx % 3));
          const viewers = 8 + ((pIdx * 7) % 25);

          return (
            <div key={product.id} data-feed-card={pIdx} className="feed-card"
              onTouchStart={(e) => onCardTouchStart(e, product.id)}
              onTouchEnd={(e) => onCardTouchEnd(e, product)}>
              {/* ── Background image ── */}
              <div className="absolute inset-0 z-0">
                {product.images?.[ci] ? (
                  <img src={product.images[ci]} alt={product.title}
                    className="h-full w-full object-cover" loading={pIdx < 3 ? "eager" : "lazy"}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-violet-900/50 to-black grid place-items-center">
                    <Package className="text-white/10" size={80} />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/50" />
              </div>

              {/* ── Heart burst ── */}
              {heartBurst === product.id && (
                <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                  <Heart className="text-red-500 animate-like-burst" size={100} fill="currentColor" />
                </div>
              )}

              {/* ── Top bar ── */}
              <div className="absolute top-0 left-0 right-0 z-10 p-3 flex items-center justify-between safe-top">
                <div className="flex items-center gap-2">
                  {onClose && (
                    <button onClick={onClose} className="rounded-full bg-black/40 backdrop-blur-sm p-1.5 text-white/80 hover:bg-white/20">
                      <ArrowLeft size={16} />
                    </button>
                  )}
                  <span className="rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-black text-white animate-pulse">🔴 LIVE</span>
                  <span className="rounded-full bg-black/40 backdrop-blur-sm px-2 py-0.5 text-[10px] font-bold text-white/70">👁 {viewers}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={toggleMusic} className="rounded-full bg-black/40 backdrop-blur-sm p-1.5 text-white/70">
                    {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>
                  {!muted && (
                    <div className="h-7 w-7 rounded-full border-2 border-white/30 bg-black/60 grid place-items-center animate-spin-slow">
                      <Music size={8} className="text-white/60" />
                    </div>
                  )}
                </div>
              </div>

              {/* ── Image dots ── */}
              {multiImg && (
                <div className="absolute top-12 left-0 right-0 z-10 flex justify-center gap-1">
                  {product.images.slice(0, 6).map((_, i) => (
                    <button key={i} onClick={() => setImgIdx(product.id, i)}
                      className={`h-1 rounded-full transition-all ${i === ci ? "w-5 bg-white" : "w-1 bg-white/40"}`} />
                  ))}
                </div>
              )}

              {/* ── Image arrows ── */}
              {multiImg && ci > 0 && (
                <button onClick={() => setImgIdx(product.id, ci - 1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/30 p-1.5 text-white/50">
                  <ChevronLeft size={18} />
                </button>
              )}
              {multiImg && ci < product.images.length - 1 && (
                <button onClick={() => setImgIdx(product.id, ci + 1)}
                  className="absolute right-14 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/30 p-1.5 text-white/50">
                  <ChevronRight size={18} />
                </button>
              )}

              {/* ── Right actions ── */}
              <div className="absolute right-2 bottom-36 z-10 flex flex-col items-center gap-4">
                <button onClick={() => toggleLike(product.id)} className="flex flex-col items-center gap-0.5 active:scale-125 transition">
                  <div className={`rounded-full p-2 ${likes[product.id] ? "bg-red-500/20" : "bg-black/30 backdrop-blur-sm"}`}>
                    <Heart size={24} className={likes[product.id] ? "text-red-500" : "text-white"} fill={likes[product.id] ? "currentColor" : "none"} />
                  </div>
                  <span className="text-[10px] font-bold text-white/80">{(likeCounts[product.id] || 0).toLocaleString()}</span>
                </button>

                <button onClick={() => setActiveSheet({ type: "comments", idx: pIdx })} className="flex flex-col items-center gap-0.5 active:scale-110 transition">
                  <div className="rounded-full bg-black/30 backdrop-blur-sm p-2"><MessageCircle size={24} className="text-white" /></div>
                  <span className="text-[10px] font-bold text-white/80">{comments.length}</span>
                </button>

                <button onClick={() => { if (navigator.share) navigator.share({ title: product.title, url: window.location.href }); }}
                  className="flex flex-col items-center gap-0.5 active:scale-110 transition">
                  <div className="rounded-full bg-black/30 backdrop-blur-sm p-2"><Share2 size={22} className="text-white" /></div>
                  <span className="text-[10px] font-bold text-white/80">Share</span>
                </button>

                <button onClick={() => { onAddToCart(product); if (muted) { startMusic(); setMuted(false); } }}
                  className="flex flex-col items-center gap-0.5 active:scale-110 transition">
                  <div className="rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 p-2.5 shadow-lg shadow-violet-500/30">
                    <ShoppingCart size={22} className="text-black" />
                  </div>
                  <span className="text-[10px] font-black text-emerald-400">Cumpără</span>
                </button>
              </div>

              {/* ── Bottom info ── */}
              <div className="absolute bottom-2 left-0 right-14 z-10 px-3 safe-bottom">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="rounded-full bg-violet-500/30 backdrop-blur-sm px-2 py-0.5 text-[9px] font-bold text-violet-300">{product.category || "General"}</span>
                  {product.discountPercent > 0 && <span className="rounded-full bg-red-500/80 px-1.5 py-0.5 text-[9px] font-black text-white">-{product.discountPercent}%</span>}
                  {product.qualityScore >= 8 && <span className="rounded-full bg-amber-400/80 px-1.5 py-0.5 text-[9px] font-black text-black">⭐ TOP</span>}
                </div>
                <h2 className="text-base font-black leading-tight text-white drop-shadow-lg line-clamp-2">{product.title}</h2>
                <div className="mt-1 flex items-end gap-2">
                  <span className="text-xl font-black text-emerald-400">{product.price} lei</span>
                  {product.oldPrice > product.price && <span className="text-xs text-white/40 line-through">{product.oldPrice} lei</span>}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-white/50">
                  {product.rating > 0 && <span className="flex items-center gap-0.5 text-amber-300"><Star size={10} fill="currentColor" /> {product.rating.toFixed(1)}</span>}
                  {product.orders > 0 && <span>{product.orders.toLocaleString()}+ vândute</span>}
                  <span className="flex items-center gap-0.5"><Truck size={10} /> ~{product.deliveryDays}z</span>
                </div>
                <button onClick={() => { setActiveSheet({ type: "details", idx: pIdx }); setSelectedSize(null); }}
                  className="mt-1.5 flex items-center gap-1 rounded-full bg-white/10 backdrop-blur-sm px-2.5 py-1 text-[10px] font-bold text-white/70">
                  <ChevronUp size={12} /> Detalii · Mărimi · Poze
                </button>
              </div>

              {/* ── Counter ── */}
              <div className="absolute left-1/2 -translate-x-1/2 bottom-0 z-10 pb-0.5">
                <span className="text-[8px] text-white/15">{pIdx + 1}/{products.length}</span>
              </div>
            </div>
          );
        })}

        {/* ── Infinite scroll sentinel ── */}
        <div ref={sentinelRef} className="feed-card flex items-center justify-center shrink-0">
          {isLoading ? (
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          ) : (
            <p className="text-white/20 text-sm">Scroll pentru mai multe...</p>
          )}
        </div>
      </div>

      {/* ── Details sheet ── */}
      {activeSheet?.type === "details" && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={() => setActiveSheet(null)}>
          <div className="w-full max-w-lg mx-auto rounded-t-[2rem] border-t border-white/10 bg-[#0b0b12] p-5 max-h-[75vh] overflow-y-auto animate-slideUp" onClick={e => e.stopPropagation()}>
            {(() => {
              const p = products[activeSheet.idx]; if (!p) return null;
              const ci = getImgIdx(p.id);
              return (<>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-black">Detalii produs</h3>
                  <button onClick={() => setActiveSheet(null)} className="rounded-full bg-white/10 p-1.5"><X size={16} /></button>
                </div>
                {p.images?.length > 1 && (
                  <div className="mb-4">
                    <p className="text-xs font-bold text-white/40 mb-2 uppercase tracking-wider">Galerie ({p.images.length})</p>
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                      {p.images.map((img, i) => (
                        <img key={i} src={img} alt="" loading="lazy"
                          className={`h-20 w-20 flex-shrink-0 rounded-xl object-cover cursor-pointer border-2 transition ${i === ci ? "border-violet-500 scale-105" : "border-transparent opacity-60"}`}
                          onClick={() => { setImgIdx(p.id, i); setActiveSheet(null); }} />
                      ))}
                    </div>
                  </div>
                )}
                <div className="mb-4">
                  <p className="text-xs font-bold text-white/40 mb-2 uppercase tracking-wider">Mărime</p>
                  <div className="flex flex-wrap gap-2">
                    {sizes.map(s => (
                      <button key={s} onClick={() => setSelectedSize(s === selectedSize ? null : s)}
                        className={`rounded-xl border px-3 py-1.5 text-sm font-bold transition ${selectedSize === s ? "border-violet-500 bg-violet-500/20 text-violet-300" : "border-white/10 text-white/60"}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                {p.description && (
                  <div className="mb-4">
                    <p className="text-xs font-bold text-white/40 mb-2 uppercase tracking-wider">Descriere</p>
                    <p className="text-sm text-white/70 leading-relaxed">{p.description}</p>
                  </div>
                )}
                {p.benefits?.length > 0 && (
                  <div className="mb-4 space-y-1.5">
                    {p.benefits.map((b, i) => (
                      <div key={i} className="rounded-xl bg-emerald-500/5 border border-emerald-500/10 px-3 py-2 text-sm text-emerald-300/80">✓ {b}</div>
                    ))}
                  </div>
                )}
                <button onClick={() => { onAddToCart(p); setActiveSheet(null); }}
                  className="w-full rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 py-3.5 text-base font-black text-black">
                  🛒 Adaugă în coș — {p.price} lei
                </button>
              </>);
            })()}
          </div>
        </div>
      )}

      {/* ── Comments sheet ── */}
      {activeSheet?.type === "comments" && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={() => setActiveSheet(null)}>
          <div className="w-full max-w-lg mx-auto rounded-t-[2rem] border-t border-white/10 bg-[#0b0b12] p-5 max-h-[60vh] overflow-y-auto animate-slideUp" onClick={e => e.stopPropagation()}>
            {(() => {
              const comments = COMMENTS.slice(0, 3 + (activeSheet.idx % 3));
              return (<>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-black">{comments.length} Comentarii</h3>
                  <button onClick={() => setActiveSheet(null)} className="rounded-full bg-white/10 p-1.5"><X size={16} /></button>
                </div>
                <div className="space-y-4">
                  {comments.map((c, i) => (
                    <div key={i} className="flex gap-3">
                      <div className={`h-9 w-9 flex-shrink-0 rounded-full ${c.color} grid place-items-center text-xs font-black`}>{c.avatar}</div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white/80">{c.name}</span>
                          <span className="text-[10px] text-white/30">{c.time}</span>
                        </div>
                        <p className="text-sm text-white/60 mt-0.5">{c.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-2.5">
                  <input className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30" placeholder="Adaugă un comentariu..." />
                  <button className="rounded-full bg-violet-500 px-3 py-1.5 text-xs font-bold text-white">Trimite</button>
                </div>
              </>);
            })()}
          </div>
        </div>
      )}
    </>
  );
}
