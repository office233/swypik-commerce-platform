"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Heart, MessageCircle, Package, Share2, ShoppingCart, Star, Truck, X } from "lucide-react";
import { THEME } from "@/lib/ui/theme";

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
  commerceBadge?: string;
};

type Props = {
  products: FeedProduct[];
  onAddToCart: (p: FeedProduct) => void;
  onLoadMore?: () => void;
  onClose?: () => void;
  isLoading: boolean;
};

type GeneratedComment = { name: string; avatar: string; text: string; time: string };

const COMMENT_NAMES = ["Maria S.", "Andrei P.", "Elena D.", "Cristina R.", "Mihai C.", "Ioana B.", "Vlad T.", "Ana M."];
const COMMENT_TEXTS = [
  "Arată foarte bine în poze, pare o alegere inspirată.",
  "Preț bun pentru ce oferă. L-aș pune în coș.",
  "Merge perfect pentru cadou.",
  "Descrierea m-a convins, pare foarte util.",
  "Livrarea rapidă e un mare plus.",
  "Raport calitate-preț foarte ok.",
  "Pare premium și ușor de combinat într-un bundle.",
  "Asta e genul de produs pe care îl alegi rapid.",
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
    };
  });
}

function aiOverlay(product: FeedProduct) {
  if (product.commerceBadge) return product.commerceBadge;
  if (product.socialProofLabel) return product.socialProofLabel;
  if (product.discountPercent >= 20) return "🔥 Deal bun pentru coș";
  if (product.rating >= 4.8) return "⚡ Alegere sigură";
  if ((product.orders || 0) > 250) return "🛒 Foarte ales recent";
  return "✨ Recomandat de AI";
}

export default function ProductFeed({ products, onAddToCart, onLoadMore, onClose, isLoading }: Props) {
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [activeSheet, setActiveSheet] = useState<{ type: "comments" | "details"; idx: number } | null>(null);
  const [imgIndices, setImgIndices] = useState<Record<string, number>>({});
  const [heartBurst, setHeartBurst] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
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
      <div className="feed-scroll flex items-center justify-center bg-[#FFF7ED]">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
          <p className="mt-4 text-sm font-bold text-slate-500">Se încarcă produsele...</p>
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="feed-scroll flex items-center justify-center bg-[#FFF7ED]">
        <div className="px-8 text-center">
          <Package className="mx-auto mb-4 text-orange-300" size={48} />
          <p className="font-black text-slate-500">Încă nu sunt produse</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div ref={scrollRef} className="feed-scroll bg-[#FFF7ED]">
        {products.map((product, pIdx) => {
          const imageIndex = getImgIdx(product.id);
          const multiImg = product.images?.length > 1;
          const comments = generateComments(product);
          const viewers = product.viewers || 12;
          const overlay = aiOverlay(product);

          return (
            <div key={product.id} data-feed-card={pIdx} className="feed-card bg-[#FFF7ED]" onTouchStart={(e) => onCardTouchStart(e, product.id)} onTouchEnd={(e) => onCardTouchEnd(e, product)}>
              <div className="absolute inset-x-3 top-4 bottom-28 z-0 overflow-hidden rounded-[2rem] bg-white shadow-[0_25px_70px_rgba(15,23,42,0.18)]">
                {product.images?.[imageIndex] ? (
                  <img src={product.images[imageIndex]} alt={product.title} className="h-full w-full object-cover" loading={pIdx < 3 ? "eager" : "lazy"} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-orange-50">
                    <Package className="text-orange-300" size={80} />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-white/10" />
              </div>

              {heartBurst === product.id && <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"><Heart className="animate-like-burst text-red-500" size={100} fill="currentColor" /></div>}

              <div className="safe-top absolute left-0 right-0 top-0 z-20 flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  {onClose && <button onClick={onClose} className="rounded-full bg-white p-2 text-slate-900 shadow-lg"><ArrowLeft size={17} /></button>}
                  <span className="rounded-full bg-[#EF4444] px-3 py-1 text-[10px] font-black text-white shadow-lg">🔥 Popular acum</span>
                  <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-slate-700 shadow">👁 {viewers} urmăresc</span>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-[#FF5A1F] shadow">AI Feed</span>
              </div>

              {multiImg && <div className="absolute left-0 right-0 top-16 z-20 flex justify-center gap-1">{product.images.slice(0, 6).map((_, i) => <button key={i} onClick={() => setImgIdx(product.id, i)} className={`h-1.5 rounded-full transition-all ${i === imageIndex ? "w-6 bg-[#FF5A1F]" : "w-1.5 bg-white/70"}`} />)}</div>}
              {multiImg && imageIndex > 0 && <button onClick={() => setImgIdx(product.id, imageIndex - 1)} className="absolute left-5 top-1/2 z-20 rounded-full bg-white/90 p-2 text-slate-700 shadow"><ChevronLeft size={18} /></button>}
              {multiImg && imageIndex < product.images.length - 1 && <button onClick={() => setImgIdx(product.id, imageIndex + 1)} className="absolute right-16 top-1/2 z-20 rounded-full bg-white/90 p-2 text-slate-700 shadow"><ChevronRight size={18} /></button>}

              <div className="absolute bottom-40 right-4 z-20 flex flex-col items-center gap-4">
                <button onClick={() => toggleLike(product.id)} className="flex flex-col items-center gap-0.5 transition active:scale-125">
                  <div className={`rounded-full p-2.5 shadow-lg ${likes[product.id] ? "bg-red-500 text-white" : "bg-white text-slate-900"}`}><Heart size={24} fill={likes[product.id] ? "currentColor" : "none"} /></div>
                  <span className="text-[10px] font-black text-white drop-shadow">{(likeCounts[product.id] || 0).toLocaleString()}</span>
                </button>
                <button onClick={() => setActiveSheet({ type: "comments", idx: pIdx })} className="flex flex-col items-center gap-0.5 transition active:scale-110">
                  <div className="rounded-full bg-white p-2.5 text-slate-900 shadow-lg"><MessageCircle size={24} /></div>
                  <span className="text-[10px] font-black text-white drop-shadow">{product.commentCount || comments.length}</span>
                </button>
                <button className="flex flex-col items-center gap-0.5 transition active:scale-110">
                  <div className="rounded-full bg-white p-2.5 text-slate-900 shadow-lg"><Share2 size={22} /></div>
                  <span className="text-[10px] font-black text-white drop-shadow">Share</span>
                </button>
              </div>

              <div className="absolute bottom-28 left-4 right-4 z-20 rounded-[1.6rem] bg-white/95 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.18)] backdrop-blur-xl">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#FF5A1F] px-3 py-1 text-[10px] font-black text-white">{overlay}</span>
                  {product.discountPercent > 0 && <span className="rounded-full bg-[#EF4444] px-3 py-1 text-[10px] font-black text-white">-{product.discountPercent}%</span>}
                </div>
                <h2 className="line-clamp-2 text-xl font-black leading-tight text-slate-950">{product.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-600">{product.description}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                  <span className="text-amber-500"><Star size={13} className="inline" fill="currentColor" /> {product.rating.toFixed(1)}</span>
                  <span>{product.orders.toLocaleString()}+ comenzi</span>
                  <span><Truck size={13} className="inline" /> {product.deliveryDays} zile</span>
                </div>
                <div className="mt-3 flex items-end gap-2"><span className="text-3xl font-black text-[#FF5A1F]">{product.price} lei</span>{product.oldPrice > product.price && <span className="pb-1 text-sm text-slate-400 line-through">{product.oldPrice} lei</span>}</div>
              </div>

              <div className="absolute bottom-0 left-0 right-0 z-30 border-t border-orange-100 bg-white/95 p-4 shadow-[0_-14px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl">
                <div className="flex gap-2">
                  <button onClick={() => setActiveSheet({ type: "details", idx: pIdx })} className="flex-1 rounded-2xl bg-orange-50 py-3 text-sm font-black text-[#FF5A1F] ring-1 ring-orange-100">Detalii</button>
                  <button onClick={() => onAddToCart(product)} className={`flex-[1.6] rounded-2xl py-3 text-sm font-black ${THEME.classes.cartButton}`}><ShoppingCart size={17} className="mr-1 inline" /> Adaugă în coș</button>
                </div>
                <button onClick={() => onAddToCart(product)} className="mt-2 w-full rounded-2xl bg-[#FF5A1F] py-3 text-sm font-black text-white shadow-xl shadow-orange-500/20">🔥 Ia-l acum / fă bundle</button>
              </div>
            </div>
          );
        })}
        <div ref={sentinelRef} className="h-10" />
        {isLoading && <div className="py-6 text-center text-sm font-bold text-slate-400">Se încarcă mai multe produse...</div>}
      </div>

      {activeSheet && products[activeSheet.idx] && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={() => setActiveSheet(null)}>
          <div className="max-h-[70vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-white p-5 text-slate-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-black">{activeSheet.type === "comments" ? "Discuții despre produs" : "Detalii produs"}</h3><button onClick={() => setActiveSheet(null)} className="rounded-full bg-orange-50 p-1.5"><X size={16} /></button></div>
            {activeSheet.type === "comments" ? (
              <div className="space-y-4">{generateComments(products[activeSheet.idx]).map((comment, i) => <div key={`${comment.name}-${i}`} className="flex gap-3"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-orange-100 text-xs font-black text-orange-600">{comment.avatar}</div><div><div className="flex items-center gap-2"><p className="text-sm font-black text-slate-900">{comment.name}</p><p className="text-[10px] font-bold text-slate-400">{comment.time}</p></div><p className="mt-0.5 text-sm font-semibold text-slate-600">{comment.text}</p></div></div>)}</div>
            ) : (
              <div className="space-y-3"><p className="text-sm font-semibold leading-relaxed text-slate-600">{products[activeSheet.idx].description}</p>{products[activeSheet.idx].benefits.map((benefit, i) => <div key={i} className="rounded-2xl bg-orange-50 px-3 py-2.5 text-sm font-bold text-slate-700">✓ {benefit}</div>)}<button onClick={() => { onAddToCart(products[activeSheet.idx]); setActiveSheet(null); }} className={`mt-2 w-full rounded-2xl py-3 font-black ${THEME.classes.cartButton}`}>🛒 Adaugă în coș</button></div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
