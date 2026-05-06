"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Heart, MessageCircle, ShoppingCart, Share2, ChevronUp,
  ChevronDown, Volume2, VolumeX, X, Star, Truck, Package,
  ChevronLeft, ChevronRight, Music,
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

type Props = {
  products: FeedProduct[];
  onAddToCart: (p: FeedProduct) => void;
  onLoadMore?: () => void;
  isLoading: boolean;
};

export default function ProductFeed({ products, onAddToCart, onLoadMore, isLoading }: Props) {
  const [idx, setIdx] = useState(0);
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [showComments, setShowComments] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [muted, setMuted] = useState(true);
  const [imgIdx, setImgIdx] = useState(0);
  const [heartBurst, setHeartBurst] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const touchRef = useRef<{ y: number; t: number } | null>(null);
  const scrollLock = useRef(false);

  // Init like counts
  useEffect(() => {
    const c: Record<string, number> = {};
    products.forEach((p, i) => { c[p.id] = [142, 89, 234, 56, 312, 178, 423, 67][i % 8]; });
    setLikeCounts(c);
  }, [products]);

  // Navigate to product
  const goTo = useCallback((newIdx: number) => {
    if (newIdx < 0 || newIdx >= products.length || transitioning) return;
    setTransitioning(true);
    setIdx(newIdx);
    setImgIdx(0);
    setShowDetails(false);
    setShowComments(false);
    setSelectedSize(null);
    setTimeout(() => setTransitioning(false), 400);

    // Infinite scroll — load more when near end
    if (newIdx >= products.length - 3 && onLoadMore) {
      onLoadMore();
    }
  }, [products.length, transitioning, onLoadMore]);

  // Mouse wheel scroll
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (showDetails || showComments || scrollLock.current) return;
      e.preventDefault();
      scrollLock.current = true;
      if (e.deltaY > 30) goTo(idx + 1);
      else if (e.deltaY < -30) goTo(idx - 1);
      setTimeout(() => { scrollLock.current = false; }, 600);
    };
    window.addEventListener("wheel", handler, { passive: false });
    return () => window.removeEventListener("wheel", handler);
  }, [idx, goTo, showDetails, showComments]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") goTo(idx + 1);
      else if (e.key === "ArrowUp") goTo(idx - 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [idx, goTo]);

  // Touch swipe
  const onTouchStart = (e: React.TouchEvent) => {
    touchRef.current = { y: e.touches[0].clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchRef.current || showDetails || showComments) return;
    const dy = touchRef.current.y - e.changedTouches[0].clientY;
    const dt = Date.now() - touchRef.current.t;
    if (Math.abs(dy) > 40 && dt < 500) {
      if (dy > 0) goTo(idx + 1);
      else goTo(idx - 1);
    }
    touchRef.current = null;
  };

  // ── Ambient Music (Web Audio API) ──
  function startMusic() {
    if (audioCtxRef.current) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;
    const master = ctx.createGain();
    master.gain.value = 0.07;
    master.connect(ctx.destination);

    // Cmaj7 pad — calming, luxury feel
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

    // Soft kick ~72 BPM
    const kick = () => {
      if (!audioCtxRef.current || audioCtxRef.current.state !== "running") return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
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
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  }

  useEffect(() => () => stopMusic(), []);

  const toggleMusic = () => {
    if (muted) { startMusic(); setMuted(false); }
    else { stopMusic(); setMuted(true); }
  };

  // Like
  const toggleLike = (id: string) => {
    const was = likes[id];
    setLikes(p => ({ ...p, [id]: !was }));
    setLikeCounts(p => ({ ...p, [id]: (p[id] || 0) + (was ? -1 : 1) }));
    if (!was) {
      setHeartBurst(true);
      setTimeout(() => setHeartBurst(false), 900);
      if (muted) { startMusic(); setMuted(false); }
    }
  };

  // Double tap
  const tapTimer = useRef<number | null>(null);
  const handleTap = () => {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      toggleLike(product.id);
    } else {
      tapTimer.current = window.setTimeout(() => { tapTimer.current = null; }, 300);
    }
  };

  // ── Render states ──
  if (isLoading && products.length === 0) {
    return (
      <div className="feed-container flex items-center justify-center">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-400 border-t-transparent mx-auto" />
          <p className="mt-4 text-sm text-white/40">Se încarcă produsele...</p>
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="feed-container flex items-center justify-center">
        <div className="text-center px-8">
          <Package className="mx-auto mb-4 text-white/20" size={48} />
          <p className="text-white/50 font-bold">Încă nu sunt produse</p>
          <p className="text-white/30 text-sm mt-1">Apasă pe o categorie pentru a vedea produse!</p>
        </div>
      </div>
    );
  }

  const product = products[idx];
  if (!product) return null;

  const comments = COMMENTS.slice(0, 3 + (idx % 3));
  const viewers = 8 + ((idx * 7) % 25);
  const sizes = ["XS", "S", "M", "L", "XL", "XXL"];
  const multiImg = product.images?.length > 1;

  return (
    <div
      className="feed-container relative select-none overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ── Full-screen product image ── */}
      <div
        className={`absolute inset-0 z-0 transition-opacity duration-400 ${transitioning ? "opacity-0" : "opacity-100"}`}
        onClick={handleTap}
      >
        {product.images?.[imgIdx] ? (
          <img
            src={product.images[imgIdx]}
            alt={product.title}
            className="h-full w-full object-cover"
            loading="eager"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-violet-900/50 to-black grid place-items-center">
            <Package className="text-white/10" size={80} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/40" />
      </div>

      {/* ── Heart burst ── */}
      {heartBurst && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <Heart className="text-red-500 animate-like-burst" size={100} fill="currentColor" />
        </div>
      )}

      {/* ── Top bar ── */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-red-500/90 px-2.5 py-1 text-[10px] font-black text-white animate-pulse">🔴 LIVE</span>
          <span className="rounded-full bg-black/40 backdrop-blur-sm px-2.5 py-1 text-[10px] font-bold text-white/70">👁 {viewers} se uită</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleMusic} className="rounded-full bg-black/40 backdrop-blur-sm p-2 text-white/70 hover:bg-white/20">
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          {!muted && (
            <div className="h-8 w-8 rounded-full border-2 border-white/30 bg-black/60 grid place-items-center animate-spin-slow">
              <Music size={10} className="text-white/60" />
            </div>
          )}
        </div>
      </div>

      {/* ── Image dots ── */}
      {multiImg && (
        <div className="absolute top-14 left-0 right-0 z-10 flex justify-center gap-1.5">
          {product.images.slice(0, 6).map((_, i) => (
            <button key={i} onClick={() => setImgIdx(i)}
              className={`h-1.5 rounded-full transition-all ${i === imgIdx ? "w-6 bg-white" : "w-1.5 bg-white/40"}`} />
          ))}
        </div>
      )}

      {/* ── Image arrows ── */}
      {multiImg && imgIdx > 0 && (
        <button onClick={() => setImgIdx(i => Math.max(0, i - 1))}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/30 backdrop-blur-sm p-2 text-white/60">
          <ChevronLeft size={20} />
        </button>
      )}
      {multiImg && imgIdx < product.images.length - 1 && (
        <button onClick={() => setImgIdx(i => Math.min(product.images.length - 1, i + 1))}
          className="absolute right-14 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/30 backdrop-blur-sm p-2 text-white/60">
          <ChevronRight size={20} />
        </button>
      )}

      {/* ── Right-side actions (TikTok style) ── */}
      <div className="absolute right-3 bottom-44 z-10 flex flex-col items-center gap-5">
        {/* Like */}
        <button onClick={() => toggleLike(product.id)} className="flex flex-col items-center gap-1 active:scale-125 transition">
          <div className={`rounded-full p-2.5 ${likes[product.id] ? "bg-red-500/20" : "bg-black/30 backdrop-blur-sm"}`}>
            <Heart size={26} className={likes[product.id] ? "text-red-500" : "text-white"} fill={likes[product.id] ? "currentColor" : "none"} />
          </div>
          <span className="text-[11px] font-bold text-white/80">{(likeCounts[product.id] || 0).toLocaleString()}</span>
        </button>

        {/* Comment */}
        <button onClick={() => { setShowComments(true); setShowDetails(false); }} className="flex flex-col items-center gap-1 active:scale-110 transition">
          <div className="rounded-full bg-black/30 backdrop-blur-sm p-2.5"><MessageCircle size={26} className="text-white" /></div>
          <span className="text-[11px] font-bold text-white/80">{comments.length}</span>
        </button>

        {/* Share */}
        <button onClick={() => { if (navigator.share) navigator.share({ title: product.title, text: `${product.title} — ${product.price} lei`, url: window.location.href }); }}
          className="flex flex-col items-center gap-1 active:scale-110 transition">
          <div className="rounded-full bg-black/30 backdrop-blur-sm p-2.5"><Share2 size={24} className="text-white" /></div>
          <span className="text-[11px] font-bold text-white/80">Share</span>
        </button>

        {/* Cart */}
        <button onClick={() => { onAddToCart(product); if (muted) { startMusic(); setMuted(false); } }}
          className="flex flex-col items-center gap-1 active:scale-110 transition">
          <div className="rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 p-3 shadow-lg shadow-violet-500/30 animate-pulse-glow">
            <ShoppingCart size={24} className="text-black" />
          </div>
          <span className="text-[11px] font-black text-emerald-400">Cumpără</span>
        </button>
      </div>

      {/* ── Bottom product info ── */}
      <div className="absolute bottom-4 left-0 right-16 z-10 px-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="rounded-full bg-violet-500/30 backdrop-blur-sm px-2.5 py-0.5 text-[10px] font-bold text-violet-300">{product.category || "General"}</span>
          {product.discountPercent > 0 && <span className="rounded-full bg-red-500/80 px-2 py-0.5 text-[10px] font-black text-white">-{product.discountPercent}%</span>}
          {product.qualityScore >= 8 && <span className="rounded-full bg-amber-400/80 px-2 py-0.5 text-[10px] font-black text-black">⭐ TOP</span>}
        </div>
        <h2 className="text-lg font-black leading-tight text-white drop-shadow-lg line-clamp-2">{product.title}</h2>
        <div className="mt-1.5 flex items-end gap-2">
          <span className="text-2xl font-black text-emerald-400 drop-shadow-lg">{product.price} lei</span>
          {product.oldPrice > product.price && <span className="pb-0.5 text-sm text-white/40 line-through">{product.oldPrice} lei</span>}
        </div>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-white/50">
          {product.rating > 0 && <span className="flex items-center gap-0.5 text-amber-300"><Star size={11} fill="currentColor" /> {product.rating.toFixed(1)}</span>}
          {product.orders > 0 && <span>{product.orders.toLocaleString()}+ vândute</span>}
          <span className="flex items-center gap-0.5"><Truck size={11} /> ~{product.deliveryDays}z</span>
        </div>
        <button onClick={() => { setShowDetails(true); setShowComments(false); }}
          className="mt-2 flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-sm px-3 py-1.5 text-[11px] font-bold text-white/70 hover:bg-white/20">
          <ChevronUp size={14} /> Detalii · Mărimi · Poze
        </button>
      </div>

      {/* ── Scroll hint + counter ── */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-1 z-10 flex flex-col items-center">
        <ChevronDown size={16} className="text-white/30 animate-bounce" />
        <span className="text-[9px] text-white/20">{idx + 1}/{products.length}{isLoading ? " ⏳" : ""}</span>
      </div>

      {/* ── Details sheet ── */}
      {showDetails && (
        <div className="absolute inset-0 z-40 flex items-end bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={() => setShowDetails(false)}>
          <div className="w-full rounded-t-[2rem] border-t border-white/10 bg-[#0b0b12] p-5 max-h-[75vh] overflow-y-auto animate-slideUp" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black">Detalii produs</h3>
              <button onClick={() => setShowDetails(false)} className="rounded-full bg-white/10 p-1.5"><X size={16} /></button>
            </div>

            {multiImg && (
              <div className="mb-4">
                <p className="text-xs font-bold text-white/40 mb-2 uppercase tracking-wider">Galerie foto ({product.images.length})</p>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  {product.images.map((img, i) => (
                    <img key={i} src={img} alt="" loading="lazy"
                      className={`h-24 w-24 flex-shrink-0 rounded-xl object-cover cursor-pointer border-2 transition ${i === imgIdx ? "border-violet-500 scale-105" : "border-transparent opacity-60 hover:opacity-100"}`}
                      onClick={() => { setImgIdx(i); setShowDetails(false); }} />
                  ))}
                </div>
              </div>
            )}

            <div className="mb-4">
              <p className="text-xs font-bold text-white/40 mb-2 uppercase tracking-wider">Mărime</p>
              <div className="flex flex-wrap gap-2">
                {sizes.map(s => (
                  <button key={s} onClick={() => setSelectedSize(s === selectedSize ? null : s)}
                    className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${selectedSize === s ? "border-violet-500 bg-violet-500/20 text-violet-300" : "border-white/10 text-white/60 hover:border-white/30"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {product.description && (
              <div className="mb-4">
                <p className="text-xs font-bold text-white/40 mb-2 uppercase tracking-wider">Descriere</p>
                <p className="text-sm text-white/70 leading-relaxed">{product.description}</p>
              </div>
            )}

            {product.benefits?.length > 0 && (
              <div className="mb-4 space-y-1.5">
                {product.benefits.map((b, i) => (
                  <div key={i} className="rounded-xl bg-emerald-500/5 border border-emerald-500/10 px-3 py-2 text-sm text-emerald-300/80">✓ {b}</div>
                ))}
              </div>
            )}

            <button onClick={() => { onAddToCart(product); setShowDetails(false); }}
              className="w-full rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 py-4 text-base font-black text-black hover:scale-[1.01] active:scale-[0.99]">
              🛒 Adaugă în coș — {product.price} lei
            </button>
          </div>
        </div>
      )}

      {/* ── Comments sheet ── */}
      {showComments && (
        <div className="absolute inset-0 z-40 flex items-end bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={() => setShowComments(false)}>
          <div className="w-full rounded-t-[2rem] border-t border-white/10 bg-[#0b0b12] p-5 max-h-[60vh] overflow-y-auto animate-slideUp" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black">{comments.length} Comentarii</h3>
              <button onClick={() => setShowComments(false)} className="rounded-full bg-white/10 p-1.5"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              {comments.map((c, i) => (
                <div key={i} className="flex gap-3">
                  <div className={`h-9 w-9 flex-shrink-0 rounded-full ${c.color} grid place-items-center text-xs font-black`}>{c.avatar}</div>
                  <div className="flex-1">
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
          </div>
        </div>
      )}
    </div>
  );
}
