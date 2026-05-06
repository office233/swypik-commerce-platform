"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Heart,
  MessageCircle,
  Music,
  Package,
  Share2,
  ShoppingCart,
  Star,
  Truck,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

type FeedProduct = {
  id: string;
  title: string;
  description: string;
  benefits: string[];
  dealLabel: string;
  whyBuy: string;
  warnings: string[];
  price: number;
  oldPrice: number;
  discountPercent: number;
  rating: number;
  orders: number;
  deliveryDays: number;
  images: string[];
  category: string;
  gradient: string;
  qualityScore: number;
  viewers?: number;
  cartAdds?: number;
  likes?: number;
  commentCount?: number;
  socialProofLabel?: string;
};

type GeneratedComment = {
  name: string;
  avatar: string;
  text: string;
  time: string;
  color: string;
};

type Props = {
  products: FeedProduct[];
  onAddToCart: (p: FeedProduct) => void;
  onLoadMore?: () => void;
  onClose?: () => void;
  isLoading: boolean;
};

const COMMENT_NAMES = ["Maria S.", "Andrei P.", "Elena D.", "Cristina R.", "Mihai C.", "Ioana B.", "Vlad T.", "Ana M."];
const COMMENT_COLORS = [
  "bg-pink-500/20 text-pink-400",
  "bg-emerald-500/20 text-emerald-400",
  "bg-violet-500/20 text-violet-400",
  "bg-amber-500/20 text-amber-400",
  "bg-cyan-500/20 text-cyan-400",
  "bg-orange-500/20 text-orange-400",
];
const COMMENT_TEXTS = [
  "Arată mai bine decât mă așteptam.",
  "Preț foarte bun pentru ce oferă.",
  "L-am pus în coș, pare exact ce căutam.",
  "Descrierea m-a convins, pare o alegere bună.",
  "Îmi place că are livrare rapidă în România.",
  "Raport calitate-preț foarte ok.",
  "Pare premium în poze, îl urmăresc de ceva timp.",
  "Bun pentru cadou, mai ales la reducerea asta.",
];

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function pick<T>(items: T[], seed: number): T {
  return items[seed % items.length];
}

function generateComments(product: FeedProduct): GeneratedComment[] {
  const seed = hashString(`${product.id}:${product.title}`);
  const count = Math.max(3, Math.min(6, product.commentCount || 4));

  return Array.from({ length: count }).map((_, index) => {
    const localSeed = seed + index * 97;
    const name = pick(COMMENT_NAMES, localSeed);
    return {
      name,
      avatar: name[0],
      text: pick(COMMENT_TEXTS, localSeed >> 2),
      time: `${2 + ((localSeed >> 4) % 22)}h`,
      color: pick(COMMENT_COLORS, localSeed >> 6),
    };
  });
}

export default function ProductFeed({ products, onAddToCart, onLoadMore, onClose, isLoading }: Props) {
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [activeSheet, setActiveSheet] = useState<{ type: "comments" | "details"; idx: number } | null>(null);
  const [muted, setMuted] = useState(true);
  const [imgIndices, setImgIndices] = useState<Record<string, number>>({});
  const [heartBurst, setHeartBurst] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; id: string } | null>(null);

  useEffect(() => {
    const counts: Record<string, number> = {};
    products.forEach((p) => {
      counts[p.id] = p.likes || Math.max(24, Math.round((p.orders || 40) * 0.8));
    });
    setLikeCounts((prev) => ({ ...counts, ...prev }));
  }, [products]);

  useEffect(() => {
    if (!sentinelRef.current || !onLoadMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) onLoadMore();
      },
      { root: scrollRef.current, threshold: 0.1 }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [onLoadMore, products.length]);

  function startMusic() {
    if (audioCtxRef.current) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;
    const master = ctx.createGain();
    master.gain.value = 0.05;
    master.connect(ctx.destination);

    [261.63, 329.63, 392.0].forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(master);
      osc.start();
    });
  }

  function stopMusic() {
    if (!audioCtxRef.current) return;
    audioCtxRef.current.close();
    audioCtxRef.current = null;
  }

  useEffect(() => () => stopMusic(), []);

  const toggleMusic = () => {
    if (muted) {
      startMusic();
      setMuted(false);
    } else {
      stopMusic();
      setMuted(true);
    }
  };

  const toggleLike = (id: string) => {
    const wasLiked = likes[id];
    setLikes((prev) => ({ ...prev, [id]: !wasLiked }));
    setLikeCounts((prev) => ({ ...prev, [id]: (prev[id] || 0) + (wasLiked ? -1 : 1) }));
    if (!wasLiked) {
      setHeartBurst(id);
      setTimeout(() => setHeartBurst(null), 900);
    }
  };

  const getImgIdx = (id: string) => imgIndices[id] || 0;
  const setImgIdx = (id: string, i: number) => setImgIndices((prev) => ({ ...prev, [id]: i }));

  const onCardTouchStart = (e: React.TouchEvent, productId: string) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, id: productId };
  };

  const onCardTouchEnd = (e: React.TouchEvent, product: FeedProduct) => {
    if (!touchStartRef.current || touchStartRef.current.id !== product.id) return;
    const dx = touchStartRef.current.x - e.changedTouches[0].clientX;
    const dy = touchStartRef.current.y - e.changedTouches[0].clientY;

    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const current = getImgIdx(product.id);
      const maxIdx = (product.images?.length || 1) - 1;
      if (dx > 0 && current < maxIdx) setImgIdx(product.id, current + 1);
      if (dx < 0 && current > 0) setImgIdx(product.id, current - 1);
    }

    touchStartRef.current = null;
  };

  if (isLoading && products.length === 0) {
    return (
      <div className="feed-scroll flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          <p className="mt-4 text-sm text-white/40">Se încarcă produsele...</p>
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="feed-scroll flex items-center justify-center">
        <div className="px-8 text-center">
          <Package className="mx-auto mb-4 text-white/20" size={48} />
          <p className="font-bold text-white/50">Încă nu sunt produse</p>
        </div>
      </div>
    );
  }

  const sizes = ["XS", "S", "M", "L", "XL", "XXL"];

  return (
    <>
      <div ref={scrollRef} className="feed-scroll">
        {products.map((product, pIdx) => {
          const imageIndex = getImgIdx(product.id);
          const multiImg = product.images?.length > 1;
          const comments = generateComments(product);
          const viewers = product.viewers || 12;

          return (
            <div
              key={product.id}
              data-feed-card={pIdx}
              className="feed-card"
              onTouchStart={(e) => onCardTouchStart(e, product.id)}
              onTouchEnd={(e) => onCardTouchEnd(e, product)}
            >
              <div className="absolute inset-0 z-0">
                {product.images?.[imageIndex] ? (
                  <img
                    src={product.images[imageIndex]}
                    alt={product.title}
                    className="h-full w-full object-cover"
                    loading={pIdx < 3 ? "eager" : "lazy"}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-gradient-to-br from-violet-900/50 to-black">
                    <Package className="text-white/10" size={80} />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/50" />
              </div>

              {heartBurst === product.id && (
                <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                  <Heart className="animate-like-burst text-red-500" size={100} fill="currentColor" />
                </div>
              )}

              <div className="safe-top absolute left-0 right-0 top-0 z-10 flex items-center justify-between p-3">
                <div className="flex items-center gap-2">
                  {onClose && (
                    <button onClick={onClose} className="rounded-full bg-black/40 p-1.5 text-white/80 backdrop-blur-sm hover:bg-white/20">
                      <ArrowLeft size={16} />
                    </button>
                  )}
                  <span className="rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-black text-white">🔥 Popular acum</span>
                  <span className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-bold text-white/70 backdrop-blur-sm">
                    👁 {viewers} urmăresc
                  </span>
                </div>
                <button onClick={toggleMusic} className="rounded-full bg-black/40 p-1.5 text-white/70 backdrop-blur-sm">
                  {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
              </div>

              {multiImg && (
                <div className="absolute left-0 right-0 top-12 z-10 flex justify-center gap-1">
                  {product.images.slice(0, 6).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setImgIdx(product.id, i)}
                      className={`h-1 rounded-full transition-all ${i === imageIndex ? "w-5 bg-white" : "w-1 bg-white/40"}`}
                    />
                  ))}
                </div>
              )}

              {multiImg && imageIndex > 0 && (
                <button onClick={() => setImgIdx(product.id, imageIndex - 1)} className="absolute left-2 top-1/2 z-10 rounded-full bg-black/30 p-1.5 text-white/50">
                  <ChevronLeft size={18} />
                </button>
              )}
              {multiImg && imageIndex < product.images.length - 1 && (
                <button onClick={() => setImgIdx(product.id, imageIndex + 1)} className="absolute right-14 top-1/2 z-10 rounded-full bg-black/30 p-1.5 text-white/50">
                  <ChevronRight size={18} />
                </button>
              )}

              <div className="absolute bottom-36 right-2 z-10 flex flex-col items-center gap-4">
                <button onClick={() => toggleLike(product.id)} className="flex flex-col items-center gap-0.5 transition active:scale-125">
                  <div className={`rounded-full p-2 ${likes[product.id] ? "bg-red-500/20" : "bg-black/30 backdrop-blur-sm"}`}>
                    <Heart size={24} className={likes[product.id] ? "text-red-500" : "text-white"} fill={likes[product.id] ? "currentColor" : "none"} />
                  </div>
                  <span className="text-[10px] font-bold text-white/80">{(likeCounts[product.id] || 0).toLocaleString()}</span>
                </button>

                <button onClick={() => setActiveSheet({ type: "comments", idx: pIdx })} className="flex flex-col items-center gap-0.5 transition active:scale-110">
                  <div className="rounded-full bg-black/30 p-2 backdrop-blur-sm">
                    <MessageCircle size={24} className="text-white" />
                  </div>
                  <span className="text-[10px] font-bold text-white/80">{product.commentCount || comments.length}</span>
                </button>

                <button className="flex flex-col items-center gap-0.5 transition active:scale-110">
                  <div className="rounded-full bg-black/30 p-2 backdrop-blur-sm">
                    <Share2 size={22} className="text-white" />
                  </div>
                  <span className="text-[10px] font-bold text-white/80">Share</span>
                </button>

                <button onClick={() => onAddToCart(product)} className="rounded-full bg-violet-500 p-2.5 text-white shadow-lg shadow-violet-500/30 transition active:scale-110">
                  <ShoppingCart size={24} />
                </button>
              </div>

              <div className="absolute bottom-0 left-0 right-14 z-10 p-4 pb-8">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-violet-500/90 px-2 py-1 text-[10px] font-black text-white">{product.dealLabel}</span>
                  {product.discountPercent > 0 && (
                    <span className="rounded-full bg-emerald-400 px-2 py-1 text-[10px] font-black text-black">-{product.discountPercent}%</span>
                  )}
                </div>

                <h2 className="line-clamp-2 text-xl font-black leading-tight text-white drop-shadow-lg">{product.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-white/70">{product.description}</p>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/70">
                  <span className="flex items-center gap-1 text-amber-300">
                    <Star size={13} fill="currentColor" /> {product.rating.toFixed(1)}
                  </span>
                  <span>{product.orders.toLocaleString()}+ comenzi</span>
                  <span className="flex items-center gap-1">
                    <Truck size={13} /> {product.deliveryDays} zile
                  </span>
                </div>

                {product.socialProofLabel && <p className="mt-1 text-xs font-bold text-emerald-300">{product.socialProofLabel}</p>}

                <div className="mt-3 flex items-end gap-2">
                  <span className="text-3xl font-black text-white">{product.price} lei</span>
                  {product.oldPrice > product.price && <span className="pb-1 text-sm text-white/40 line-through">{product.oldPrice} lei</span>}
                </div>

                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {sizes.map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${selectedSize === size ? "border-white bg-white text-black" : "border-white/20 bg-black/20 text-white/70"}`}
                    >
                      {size}
                    </button>
                  ))}
                </div>

                <button onClick={() => onAddToCart(product)} className="mt-3 w-full rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 py-3 text-sm font-black text-black active:scale-95">
                  Adaugă în coș — {product.price} lei
                </button>
              </div>
            </div>
          );
        })}

        <div ref={sentinelRef} className="h-10" />
        {isLoading && <div className="py-6 text-center text-sm text-white/40">Se încarcă mai multe produse...</div>}
      </div>

      {activeSheet && products[activeSheet.idx] && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={() => setActiveSheet(null)}>
          <div className="max-h-[70vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] border-t border-white/10 bg-[#0b0b12] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-black text-white">{activeSheet.type === "comments" ? "Discuții despre produs" : "Detalii produs"}</h3>
              <button onClick={() => setActiveSheet(null)} className="rounded-full bg-white/10 p-1.5">
                <X size={16} />
              </button>
            </div>

            {activeSheet.type === "comments" ? (
              <div className="space-y-4">
                {generateComments(products[activeSheet.idx]).map((comment, i) => (
                  <div key={`${comment.name}-${i}`} className="flex gap-3">
                    <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black ${comment.color}`}>{comment.avatar}</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-white/90">{comment.name}</p>
                        <p className="text-[10px] text-white/30">{comment.time}</p>
                      </div>
                      <p className="mt-0.5 text-sm text-white/70">{comment.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-white/70">{products[activeSheet.idx].description}</p>
                {products[activeSheet.idx].benefits.map((benefit, i) => (
                  <div key={i} className="rounded-xl bg-white/[0.05] px-3 py-2.5 text-sm text-white/70">
                    ✓ {benefit}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
