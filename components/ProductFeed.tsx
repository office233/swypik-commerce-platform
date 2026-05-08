"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowLeft, Heart, Package, Play, ShoppingCart, Star, Truck } from "lucide-react";
import { useRouter } from "next/navigation";

type FeedProduct = {
  id: string;
  pgId?: number;
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
  video?: string | null;
  hasVideo?: boolean;
};

type Props = {
  products: FeedProduct[];
  onAddToCart: (p: FeedProduct, qty?: number) => void;
  onLoadMore?: () => void;
  onClose?: () => void;
  isLoading: boolean;
};

function aiOverlay(product: FeedProduct) {
  if (product.commerceBadge) return product.commerceBadge;
  if (product.discountPercent >= 20) return "🔥 Deal bun";
  if (product.rating >= 4.8) return "⚡ Top calitate";
  if ((product.orders || 0) > 250) return "🛒 Popular";
  return "✨ AI Pick";
}

export default function ProductFeed({ products, onAddToCart, onLoadMore, onClose, isLoading }: Props) {
  const router = useRouter();
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [heartBurst, setHeartBurst] = useState<string | null>(null);
  const [videoErrors, setVideoErrors] = useState<Record<string, boolean>>({});
  const [playingVideos, setPlayingVideos] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const videoMapRef = useRef<Record<string, HTMLVideoElement>>({});
  const [currentIdx, setCurrentIdx] = useState(0);

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !onLoadMore) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) onLoadMore(); },
      { root: scrollRef.current, threshold: 0.1 }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [onLoadMore, products.length]);

  // Auto-play/pause videos based on visibility
  useEffect(() => {
    if (!scrollRef.current) return;
    const cards = scrollRef.current.querySelectorAll("[data-feed-idx]");
    if (cards.length === 0) return;

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const idx = Number(entry.target.getAttribute("data-feed-idx"));
          const product = products[idx];
          if (!product) return;
          const video = videoMapRef.current[product.id];
          if (!video) return;

          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            video.play().catch(() => {});
            setCurrentIdx(idx);
          } else {
            video.pause();
          }
        });
      },
      { root: scrollRef.current, threshold: [0, 0.6] }
    );
    cards.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [products]);

  const toggleLike = (id: string) => {
    try { navigator?.vibrate?.(40); } catch(e) {}
    setLikes((prev) => ({ ...prev, [id]: !prev[id] }));
    if (!likes[id]) {
      setHeartBurst(id);
      setTimeout(() => setHeartBurst(null), 900);
    }
  };

  const toggleVideoPlay = (productId: string) => {
    const video = videoMapRef.current[productId];
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setPlayingVideos(p => ({ ...p, [productId]: true }))).catch(() => {});
    } else {
      video.pause();
      setPlayingVideos(p => ({ ...p, [productId]: false }));
    }
  };

  if (isLoading && products.length === 0) {
    return (
      <div className="feed-scroll flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#333] border-t-[#10A37F]" />
          <p className="mt-4 text-sm font-bold text-[#888]">Se încarcă feed-ul...</p>
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="feed-scroll flex items-center justify-center">
        <div className="px-8 text-center">
          <Package className="mx-auto mb-4 text-[#333]" size={48} />
          <p className="font-black text-[#888]">Încă nu sunt produse</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="feed-scroll">
      {/* Back button */}
      {onClose && (
        <button onClick={onClose} className="fixed left-4 top-4 z-50 rounded-full bg-black/60 p-2.5 text-white backdrop-blur-sm active:scale-90 transition-transform">
          <ArrowLeft size={20} />
        </button>
      )}

      {/* Counter */}
      <div className="fixed right-4 top-4 z-50 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm">
        {currentIdx + 1} / {products.length}
      </div>

      {products.map((product, pIdx) => {
        const overlay = aiOverlay(product);
        const hasWorkingVideo = product.video && !videoErrors[product.id];

        return (
          <div key={product.id} data-feed-idx={pIdx} className="feed-card">

            {/* ─── Full-screen media ─── */}
            <div className="feed-media" onClick={() => hasWorkingVideo ? toggleVideoPlay(product.id) : router.push(`/product/${product.pgId || product.id}`)}>
              {hasWorkingVideo ? (
                <>
                  <video
                    ref={(el) => { if (el) videoMapRef.current[product.id] = el; }}
                    src={product.video!}
                    poster={product.images?.[0]}
                    loop muted playsInline
                    preload="metadata"
                    onError={() => setVideoErrors(p => ({ ...p, [product.id]: true }))}
                    onPlay={() => setPlayingVideos(p => ({ ...p, [product.id]: true }))}
                    onPause={() => setPlayingVideos(p => ({ ...p, [product.id]: false }))}
                  />
                  {!playingVideos[product.id] && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <div className="grid h-16 w-16 place-items-center rounded-full bg-white/25 backdrop-blur-sm">
                        <Play size={32} className="ml-1 text-white" fill="white" />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {product.images?.[0] ? (
                    <img src={product.images[0]} alt={product.title} loading={pIdx < 3 ? "eager" : "lazy"} />
                  ) : (
                    <div className="h-full w-full grid place-items-center bg-[#111]">
                      <Package className="text-[#333]" size={64} />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />

            {/* Heart burst */}
            {heartBurst === product.id && (
              <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                <Heart className="animate-like-burst text-[#EF4444]" size={100} fill="currentColor" />
              </div>
            )}

            {/* Top badges */}
            <div className="absolute left-0 right-0 top-0 z-20 flex items-center gap-2 p-4" style={{ paddingTop: "max(16px, env(safe-area-inset-top))" }}>
              <span className="rounded-full bg-[#10A37F] px-3 py-1 text-[10px] font-black text-white shadow-lg">
                {product.hasVideo ? "🎬 Video" : "⚡ AI Pick"}
              </span>
              <span className="rounded-full bg-white/20 backdrop-blur-sm px-3 py-1 text-[10px] font-black text-white">
                👁 {product.viewers || 12} online
              </span>
            </div>

            {/* Right side actions */}
            <div className="absolute bottom-48 right-3 z-20 flex flex-col items-center gap-5">
              <button onClick={() => toggleLike(product.id)} className="flex flex-col items-center gap-0.5 active:scale-125 transition">
                <div className={`rounded-full p-2.5 shadow-lg ${likes[product.id] ? "bg-[#EF4444] text-white" : "bg-white/20 backdrop-blur-sm text-white"}`}>
                  <Heart size={22} fill={likes[product.id] ? "currentColor" : "none"} />
                </div>
                <span className="text-[10px] font-black text-white drop-shadow">{product.likes || Math.round((product.orders || 40) * 0.8)}</span>
              </button>
              <button onClick={() => router.push(`/product/${product.pgId || product.id}`)} className="flex flex-col items-center gap-0.5 active:scale-110 transition">
                <div className="rounded-full bg-white/20 backdrop-blur-sm p-2.5 text-white shadow-lg">
                  <ShoppingCart size={22} />
                </div>
                <span className="text-[10px] font-black text-white drop-shadow">Detalii</span>
              </button>
            </div>

            {/* Bottom product info */}
            <div className="absolute bottom-0 left-0 right-0 z-20 p-4" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
              <div className="mb-3" onClick={() => router.push(`/product/${product.pgId || product.id}`)}>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="rounded-full bg-white/20 backdrop-blur-sm px-2.5 py-0.5 text-[10px] font-black text-white">{overlay}</span>
                  {product.discountPercent > 0 && (
                    <span className="rounded-full bg-[#EF4444] px-2.5 py-0.5 text-[10px] font-black text-white">-{product.discountPercent}%</span>
                  )}
                </div>
                <h2 className="text-base font-black leading-snug text-white drop-shadow-lg line-clamp-2">{product.title}</h2>
                <div className="mt-1 flex items-center gap-3 text-xs font-semibold text-white/80">
                  <span><Star size={12} className="inline text-[#F59E0B] mr-0.5" fill="currentColor" />{product.rating.toFixed(1)}</span>
                  <span>{product.orders.toLocaleString()}+ vândute</span>
                  <span><Truck size={12} className="inline mr-0.5" />{product.deliveryDays}z</span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">{product.price} lei</span>
                  {product.oldPrice > product.price && (
                    <span className="text-sm text-white/50 line-through">{product.oldPrice} lei</span>
                  )}
                </div>
              </div>

              <button
                onClick={() => onAddToCart(product, 1)}
                className="w-full rounded-2xl bg-[#10A37F] py-3.5 text-sm font-black text-white shadow-[0_4px_20px_rgba(16,163,127,0.4)] active:scale-[0.97] transition-transform"
              >
                <ShoppingCart size={16} className="mr-1.5 inline" />
                Adaugă în coș — {product.price} lei
              </button>
            </div>
          </div>
        );
      })}

      <div ref={sentinelRef} className="h-10" />
      {isLoading && (
        <div className="py-6 text-center text-sm font-bold text-[#888]">Se încarcă mai multe...</div>
      )}
    </div>
  );
}
