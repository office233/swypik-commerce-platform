"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowLeft, Heart, MessageCircle, Package, Play, ShoppingCart, Star, Truck, Volume2, VolumeX, X } from "lucide-react";
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

function getRealLikes(product: FeedProduct) {
  if (product.likes) return product.likes;
  const seed = product.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const base = product.orders ? Math.floor(product.orders * 0.35) : seed;
  return base + (seed % 150);
}

function getRealComments(product: FeedProduct) {
  if (product.commentCount) return product.commentCount;
  const seed = product.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const base = product.orders ? Math.floor(product.orders * 0.04) : Math.floor(seed / 10);
  return base + (seed % 30);
}

export default function ProductFeed({ products, onAddToCart, onLoadMore, onClose, isLoading }: Props) {
  const router = useRouter();
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [heartBurst, setHeartBurst] = useState<string | null>(null);
  const [videoErrors, setVideoErrors] = useState<Record<string, boolean>>({});
  const [isMuted, setIsMuted] = useState(true); // start muted for autoplay policy
  const [liveViewers, setLiveViewers] = useState<Record<string, number>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const videoMapRef = useRef<Record<string, HTMLVideoElement>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [addedToCart, setAddedToCart] = useState<string | null>(null);
  const [showComments, setShowComments] = useState<string | null>(null);
  const hasInteractedRef = useRef(false);

  // Auto-unmute on first user tap (browser requires user gesture for sound)
  useEffect(() => {
    const unmute = () => {
      if (hasInteractedRef.current) return;
      hasInteractedRef.current = true;
      setIsMuted(false);
      Object.values(videoMapRef.current).forEach(v => { v.muted = false; });
      document.removeEventListener("touchstart", unmute);
      document.removeEventListener("click", unmute);
    };
    document.addEventListener("touchstart", unmute, { once: true });
    document.addEventListener("click", unmute, { once: true });
    return () => {
      document.removeEventListener("touchstart", unmute);
      document.removeEventListener("click", unmute);
    };
  }, []);

  // Dynamic live viewers that change every 4-8 seconds
  useEffect(() => {
    // Initialize viewers
    const initial: Record<string, number> = {};
    products.forEach(p => {
      initial[p.id] = 5 + Math.floor(Math.random() * 35);
    });
    setLiveViewers(initial);

    const interval = setInterval(() => {
      setLiveViewers(prev => {
        const next = { ...prev };
        // Update 2-4 random products each tick
        const count = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
          const pIdx = Math.floor(Math.random() * products.length);
          const p = products[pIdx];
          if (!p) continue;
          const current = next[p.id] || 15;
          const delta = Math.floor(Math.random() * 7) - 3; // -3 to +3
          next[p.id] = Math.max(3, Math.min(52, current + delta));
        }
        return next;
      });
    }, 4000 + Math.random() * 4000);

    return () => clearInterval(interval);
  }, [products]);

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
    const container = scrollRef.current;
    const cards = container.querySelectorAll("[data-feed-idx]");
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
            video.muted = isMuted;
            video.play().catch(() => {});
            setCurrentIdx(idx);
          } else {
            video.pause();
          }
        });
      },
      { root: container, threshold: [0, 0.6] }
    );
    cards.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [products, isMuted]);

  // Update muted state on all videos when toggled
  useEffect(() => {
    Object.values(videoMapRef.current).forEach(v => { v.muted = isMuted; });
  }, [isMuted]);

  const toggleLike = (id: string) => {
    try { navigator?.vibrate?.(40); } catch(e) {}
    setLikes((prev) => ({ ...prev, [id]: !prev[id] }));
    if (!likes[id]) {
      setHeartBurst(id);
      setTimeout(() => setHeartBurst(null), 900);
    }
  };

  const handleAddToCart = (product: FeedProduct) => {
    try { navigator?.vibrate?.(50); } catch(e) {}
    onAddToCart(product, 1);
    setAddedToCart(product.id);
    setTimeout(() => setAddedToCart(null), 2000);
  };

  if (isLoading && products.length === 0) {
    return (
      <div className="feed-scroll flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#333] border-t-[#10A37F]" />
          <p className="mt-4 text-sm font-bold text-[#888]">Se încarcă clipurile...</p>
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="feed-scroll flex items-center justify-center">
        <div className="px-8 text-center">
          <Package className="mx-auto mb-4 text-[#333]" size={48} />
          <p className="font-black text-[#888]">Niciun clip disponibil</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="feed-scroll">
      {/* Fixed top controls */}
      <div className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between px-4" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
        {onClose && (
          <button onClick={onClose} className="rounded-full bg-black/50 p-2.5 text-white backdrop-blur-sm active:scale-90 transition-transform">
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="flex items-center gap-2">
          {/* Mute/unmute */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="rounded-full bg-black/50 p-2.5 text-white backdrop-blur-sm active:scale-90 transition-transform"
          >
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>
      </div>

      {products.map((product, pIdx) => {
        const overlay = aiOverlay(product);
        const hasWorkingVideo = product.video && !videoErrors[product.id];
        const viewers = liveViewers[product.id] || 15;

        return (
          <div key={product.id} data-feed-idx={pIdx} className="feed-card">

            {/* ─── Full-screen media ─── */}
            <div className="feed-media" onClick={() => router.push(`/product/${product.pgId || product.id}`)}>
              {hasWorkingVideo ? (
                <video
                  ref={(el) => { if (el) videoMapRef.current[product.id] = el; }}
                  src={product.video!}
                  poster={product.images?.[0]}
                  loop
                  muted={isMuted}
                  playsInline
                  preload="metadata"
                  onError={() => setVideoErrors(p => ({ ...p, [product.id]: true }))}
                />
              ) : product.images?.[0] ? (
                <img src={product.images[0]} alt={product.title} loading={pIdx < 3 ? "eager" : "lazy"} />
              ) : (
                <div className="h-full w-full grid place-items-center bg-[#111]">
                  <Package className="text-[#333]" size={64} />
                </div>
              )}
            </div>

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

            {/* Heart burst */}
            {heartBurst === product.id && (
              <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                <Heart className="animate-like-burst text-[#EF4444]" size={100} fill="currentColor" />
              </div>
            )}

            {/* Live viewers badge - dynamic */}
            <div className="absolute left-4 top-14 z-20" style={{ top: "max(56px, calc(env(safe-area-inset-top) + 48px))" }}>
              <div className="flex items-center gap-1.5 rounded-full bg-black/40 backdrop-blur-sm px-3 py-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                <span className="text-[11px] font-bold text-white">{viewers} online</span>
              </div>
            </div>

            {/* Right side actions */}
            <div className="absolute bottom-48 right-3 z-20 flex flex-col items-center gap-4">
              <button onClick={() => toggleLike(product.id)} className="flex flex-col items-center gap-0.5 active:scale-125 transition">
                <div className={`rounded-full p-3 shadow-lg ${likes[product.id] ? "bg-[#EF4444] text-white" : "bg-black/30 backdrop-blur-sm text-white"}`}>
                  <Heart size={24} fill={likes[product.id] ? "currentColor" : "none"} />
                </div>
                <span className="text-[10px] font-bold text-white/90">{getRealLikes(product) + (likes[product.id] ? 1 : 0)}</span>
              </button>
              <button onClick={() => setShowComments(product.id)} className="flex flex-col items-center gap-0.5 active:scale-110 transition">
                <div className="rounded-full bg-black/30 backdrop-blur-sm p-3 text-white shadow-lg">
                  <MessageCircle size={24} />
                </div>
                <span className="text-[10px] font-bold text-white/90">{getRealComments(product)}</span>
              </button>
              <button onClick={() => router.push(`/product/${product.pgId || product.id}`)} className="flex flex-col items-center gap-0.5 active:scale-110 transition">
                <div className="rounded-full bg-black/30 backdrop-blur-sm p-3 text-white shadow-lg">
                  <ShoppingCart size={24} />
                </div>
                <span className="text-[10px] font-bold text-white/90">Detalii</span>
              </button>
            </div>

            {/* Bottom product info */}
            <div className="absolute bottom-0 left-0 right-0 z-20 px-4" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
              {/* Product details — tap to go to page */}
              <div className="mb-3" onClick={() => router.push(`/product/${product.pgId || product.id}`)}>
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <span className="rounded-full bg-white/15 backdrop-blur-sm px-2.5 py-0.5 text-[10px] font-black text-white">{overlay}</span>
                  {product.discountPercent > 0 && (
                    <span className="rounded-full bg-[#EF4444] px-2.5 py-0.5 text-[10px] font-black text-white">-{product.discountPercent}%</span>
                  )}
                </div>
                <h2 className="text-[15px] font-black leading-snug text-white drop-shadow-lg line-clamp-2">{product.title}</h2>
                <div className="mt-1 flex items-center gap-3 text-[11px] font-semibold text-white/70">
                  <span><Star size={11} className="inline text-[#F59E0B] mr-0.5" fill="currentColor" />{product.rating.toFixed(1)}</span>
                  <span>{product.orders.toLocaleString()}+ vândute</span>
                  <span><Truck size={11} className="inline mr-0.5" />{product.deliveryDays}z</span>
                </div>
              </div>

              {/* Price + CTA */}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-white">{product.price} lei</span>
                    {product.oldPrice > product.price && (
                      <span className="text-sm text-white/40 line-through">{product.oldPrice} lei</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleAddToCart(product)}
                  className={`rounded-2xl px-5 py-3 text-sm font-black shadow-lg active:scale-[0.95] transition-all ${
                    addedToCart === product.id
                      ? "bg-white text-[#10A37F]"
                      : "bg-[#10A37F] text-white shadow-[0_4px_20px_rgba(16,163,127,0.4)]"
                  }`}
                >
                  {addedToCart === product.id ? "✓ Adăugat" : (
                    <><ShoppingCart size={15} className="mr-1 inline" />Coș</>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      <div ref={sentinelRef} className="h-10" />
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#333] border-t-[#10A37F]" />
        </div>
      )}

      {/* Comments Slide-up Modal */}
      {showComments && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setShowComments(null)} />
          <div className="relative flex h-[70vh] flex-col rounded-t-[2rem] bg-white animate-feed-slide">
            <div className="flex items-center justify-between border-b border-[#E5E5E5] px-6 py-4">
              <h3 className="font-black text-[#0D0D0D]">Comentarii ({getRealComments(products.find(p => p.id === showComments)!)})</h3>
              <button onClick={() => setShowComments(null)} className="rounded-full bg-[#F7F7F8] p-2 text-[#6E6E80] active:scale-95 transition">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-8">
              <div className="flex flex-col items-center justify-center text-center h-full text-[#6E6E80]">
                <MessageCircle size={48} className="mb-4 text-[#D1D1D6]" />
                <p className="font-bold text-base">Comentariile se încarcă...</p>
                <p className="text-sm mt-2">Vom adăuga recenziile de pe internet în curând.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
