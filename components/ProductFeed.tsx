"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Heart, MessageCircle, Package, Play, ShoppingCart, Star, Truck, Volume2, VolumeX, X } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";

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
  isEstimatedSocial?: boolean;
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

function aiOverlay(p: FeedProduct) {
  if (p.commerceBadge) return p.commerceBadge;
  if (p.discountPercent >= 20) return "🔥 Deal bun";
  if (p.rating >= 4.8) return "⚡ Top calitate";
  if ((p.orders || 0) > 250) return "🛒 Popular";
  return "✨ AI Pick";
}

function getRealLikes(p: FeedProduct) {
  const seed = p.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return p.likes || Math.floor((p.orders || 40) * 0.35) + (seed % 150);
}

function getRealComments(p: FeedProduct) {
  const seed = p.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return p.commentCount || Math.floor((p.orders || 10) * 0.04) + (seed % 30);
}

export default function ProductFeed({ products, onAddToCart, onLoadMore, onClose, isLoading }: Props) {
  const router = useRouter();
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [heartBurst, setHeartBurst] = useState<string | null>(null);
  const [videoErrors, setVideoErrors] = useState<Record<string, boolean>>({});
  const [isMuted, setIsMuted] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const videoMapRef = useRef<Record<string, HTMLVideoElement>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [addedToCart, setAddedToCart] = useState<string | null>(null);
  const [showComments, setShowComments] = useState<string | null>(null);
  const hasInteractedRef = useRef(false);
  const currentProductIdRef = useRef<string | null>(null);
  const activeSinceRef = useRef<number>(Date.now());
  const seenViewRef = useRef(new Set<string>());
  const completedViewRef = useRef(new Set<string>());
  const productsRef = useRef(products);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const sendFeedEvent = useCallback((type: string, product: FeedProduct, details: Record<string, unknown> = {}) => {
    const payload = {
      type,
      productId: String(product.pgId || product.id),
      videoId: product.id,
      source: "next-feed",
      occurredAt: new Date().toISOString(),
      ...details,
    };
    const body = JSON.stringify(payload);

    try {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon("/api/v1/events", blob)) return;
      }
    } catch {}

    fetch("/api/v1/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }, []);

  const flushWatchEvent = useCallback((productId: string | null) => {
    if (!productId) return;
    const product = productsRef.current.find((p) => p.id === productId);
    if (!product) return;
    const watchMs = Math.max(0, Date.now() - activeSinceRef.current);
    if (watchMs < 250) return;
    sendFeedEvent("watch", product, {
      watchMs,
      complete: completedViewRef.current.has(product.id),
    });
  }, [sendFeedEvent]);

  useEffect(() => {
    const product = products[currentIdx];
    if (!product) return;

    const previousProductId = currentProductIdRef.current;
    if (previousProductId && previousProductId !== product.id) {
      flushWatchEvent(previousProductId);
      sendFeedEvent("swipe", product, { position: currentIdx });
    }

    currentProductIdRef.current = product.id;
    activeSinceRef.current = Date.now();

    if (!seenViewRef.current.has(product.id)) {
      seenViewRef.current.add(product.id);
      sendFeedEvent("view", product, { position: currentIdx });
    }
  }, [currentIdx, flushWatchEvent, products, sendFeedEvent]);

  useEffect(() => {
    return () => flushWatchEvent(currentProductIdRef.current);
  }, [flushWatchEvent]);

  const openProduct = useCallback((product: FeedProduct) => {
    sendFeedEvent("product_click", product, { position: currentIdx });
    router.push(`/product/${product.pgId || product.id}`);
  }, [currentIdx, router, sendFeedEvent]);

  // Auto-unmute on first user tap
  useEffect(() => {
    const unmute = () => {
      if (hasInteractedRef.current) return;
      hasInteractedRef.current = true;
      setIsMuted(false);
      Object.values(videoMapRef.current).forEach(v => { v.muted = false; });
    };
    document.addEventListener("touchstart", unmute, { once: true });
    document.addEventListener("click", unmute, { once: true });
    return () => {
      document.removeEventListener("touchstart", unmute);
      document.removeEventListener("click", unmute);
    };
  }, []);

  // Dynamic live viewer count for current card only
  const [viewers, setViewers] = useState(12);
  useEffect(() => {
    setViewers(5 + Math.floor(Math.random() * 35));
    const iv = setInterval(() => {
      setViewers(v => Math.max(3, Math.min(52, v + Math.floor(Math.random() * 7) - 3)));
    }, 5000);
    return () => clearInterval(iv);
  }, [currentIdx]);

  // Infinite scroll — trigger loadMore when 3 cards from the end
  useEffect(() => {
    if (!sentinelRef.current || !onLoadMore) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) onLoadMore(); },
      { root: scrollRef.current, threshold: 0.1 }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [onLoadMore, products.length]);

  // Auto-play/pause videos based on visibility — only current card plays
  useEffect(() => {
    if (!scrollRef.current) return;
    const cards = scrollRef.current.querySelectorAll("[data-feed-idx]");
    if (cards.length === 0) return;

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const idx = Number(entry.target.getAttribute("data-feed-idx"));
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            setCurrentIdx(idx);
          } else {
            const product = products[idx];
            if (product) {
              const video = videoMapRef.current[product.id];
              if (video) video.pause();
            }
          }
        });
      },
      { root: scrollRef.current, threshold: [0, 0.6] }
    );
    cards.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [products]);

  // Play the current video whenever currentIdx changes (handles new videos from lazy load)
  useEffect(() => {
    const product = products[currentIdx];
    if (!product) return;

    // Hide all videos, show only current
    Object.entries(videoMapRef.current).forEach(([id, vid]) => {
      if (id === product.id) {
        vid.style.opacity = '1';
        vid.muted = isMuted;
        vid.play().catch(() => {});
      } else {
        vid.style.opacity = '0';
        vid.pause();
      }
    });

    // If video hasn't loaded yet, wait for it
    const timer = setTimeout(() => {
      const video = videoMapRef.current[product.id];
      if (video && video.paused) {
        video.style.opacity = '1';
        video.muted = isMuted;
        video.play().catch(() => {});
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [currentIdx, isMuted, products]);

  // Sync muted state
  useEffect(() => {
    Object.values(videoMapRef.current).forEach(v => { v.muted = isMuted; });
  }, [isMuted]);

  const toggleLike = (product: FeedProduct) => {
    try { navigator?.vibrate?.(40); } catch(e) {}
    const isNextLiked = !likes[product.id];
    setLikes(prev => ({ ...prev, [product.id]: isNextLiked }));
    sendFeedEvent(isNextLiked ? "like" : "unlike", product, { position: currentIdx });
    if (isNextLiked) {
      setHeartBurst(product.id);
      setTimeout(() => setHeartBurst(null), 900);
    }
  };

  const handleAddToCart = (product: FeedProduct) => {
    try { navigator?.vibrate?.(50); } catch(e) {}
    sendFeedEvent("add_to_cart", product, { position: currentIdx, quantity: 1 });
    onAddToCart(product, 1);
    setAddedToCart(product.id);
    setTimeout(() => setAddedToCart(null), 2000);
  };

  const openComments = (product: FeedProduct) => {
    sendFeedEvent("comment_open", product, { position: currentIdx });
    setShowComments(product.id);
  };

  // Render video only near the active card to avoid saturating mobile network/decoders.
  const shouldLoadVideo = (idx: number) => {
    return idx >= currentIdx - 1 && idx <= currentIdx + 1;
  };

  // Trigger loadMore as user gets close to the end.
  useEffect(() => {
    if (onLoadMore && currentIdx >= products.length - 5) {
      onLoadMore();
    }
  }, [currentIdx, onLoadMore, products.length]);

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
        <button
          onClick={() => setIsMuted(!isMuted)}
          className="rounded-full bg-black/50 p-2.5 text-white backdrop-blur-sm active:scale-90 transition-transform"
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>

      {products.map((product, pIdx) => {
        const overlay = aiOverlay(product);
        const hasWorkingVideo = product.video && !videoErrors[product.id];
        const loadVideo = shouldLoadVideo(pIdx);
        const isCurrentCard = pIdx === currentIdx;
        const posterImage = product.images?.[0];

        return (
          <div key={product.id} data-feed-idx={pIdx} className="feed-card">

            {/* ─── Full-screen media — poster always visible, video lazy on top ─── */}
            <div className="feed-media" onClick={() => openProduct(product)}>
              {/* Poster image — always rendered, loads fast (~50KB) */}
              {posterImage ? (
                <Image
                  src={posterImage}
                  alt={product.title}
                  fill
                  sizes="100vw"
                  loading={pIdx < 3 ? "eager" : "lazy"}
                  priority={pIdx === 0}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center bg-[#0D0D0D] text-white/50">
                  <Package size={48} />
                </div>
              )}
              {/* Video — layered on top, eager only for the current card */}
              {hasWorkingVideo && loadVideo && (
                <video
                  ref={(el) => { if (el) videoMapRef.current[product.id] = el; }}
                  src={product.video!}
                  poster={posterImage}
                  loop
                  muted={isMuted}
                  playsInline
                  preload={isCurrentCard ? "auto" : "metadata"}
                  autoPlay={isCurrentCard}
                  className={`absolute inset-0 h-full w-full object-cover${isCurrentCard ? '' : ' opacity-0'}`}
                  style={{ transition: 'opacity 0.15s ease' }}
                  onCanPlay={(e) => {
                    const vid = e.target as HTMLVideoElement;
                    if (isCurrentCard) {
                      vid.style.opacity = '1';
                      vid.play().catch(() => {});
                    }
                  }}
                  onError={() => setVideoErrors(p => ({ ...p, [product.id]: true }))}
                />
              )}
              {/* Play icon for cards not yet loaded */}
              {hasWorkingVideo && !loadVideo && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="grid h-14 w-14 place-items-center rounded-full bg-white/20 backdrop-blur-sm">
                    <Play size={28} className="ml-0.5 text-white" fill="white" />
                  </div>
                </div>
              )}
            </div>

            {/* Gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

            {/* Heart burst */}
            {heartBurst === product.id && (
              <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                <Heart className="animate-like-burst text-[#EF4444]" size={100} fill="currentColor" />
              </div>
            )}

            {/* Live badge — only on current card */}
            {pIdx === currentIdx && (
              <div className="absolute left-4 z-20" style={{ top: "max(56px, calc(env(safe-area-inset-top) + 48px))" }}>
                <div className="flex items-center gap-1.5 rounded-full bg-black/40 backdrop-blur-sm px-3 py-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  <span className="text-[11px] font-bold text-white">{viewers} online</span>
                </div>
              </div>
            )}

            {/* Right side actions */}
            <div className="absolute bottom-48 right-3 z-20 flex flex-col items-center gap-4">
              <button type="button" onClick={() => toggleLike(product)} className="flex flex-col items-center gap-0.5 active:scale-125 transition" style={{ touchAction: "manipulation" }}>
                <div className={`rounded-full p-3 shadow-lg ${likes[product.id] ? "bg-[#EF4444] text-white" : "bg-black/30 backdrop-blur-sm text-white"}`}>
                  <Heart size={24} fill={likes[product.id] ? "currentColor" : "none"} />
                </div>
                <span className="text-[10px] font-bold text-white/90">{getRealLikes(product) + (likes[product.id] ? 1 : 0)}</span>
              </button>
              <button type="button" onClick={() => openComments(product)} className="flex flex-col items-center gap-0.5 active:scale-110 transition" style={{ touchAction: "manipulation" }}>
                <div className="rounded-full bg-black/30 backdrop-blur-sm p-3 text-white shadow-lg">
                  <MessageCircle size={24} />
                </div>
                <span className="text-[10px] font-bold text-white/90">{getRealComments(product)}</span>
              </button>
              <button type="button" onClick={() => openProduct(product)} className="flex flex-col items-center gap-0.5 active:scale-110 transition" style={{ touchAction: "manipulation" }}>
                <div className="rounded-full bg-black/30 backdrop-blur-sm p-3 text-white shadow-lg">
                  <ShoppingCart size={24} />
                </div>
                <span className="text-[10px] font-bold text-white/90">Detalii</span>
              </button>
            </div>

            {/* Bottom product info */}
            <div className="absolute bottom-0 left-0 right-0 z-20 px-4" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
              <div className="mb-3" onClick={() => openProduct(product)}>
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <span className="rounded-full bg-white/15 backdrop-blur-sm px-2.5 py-0.5 text-[10px] font-black text-white">{overlay}</span>
                  {product.discountPercent > 0 && (
                    <span className="rounded-full bg-[#EF4444] px-2.5 py-0.5 text-[10px] font-black text-white">-{product.discountPercent}%</span>
                  )}
                </div>
                <h2 className="text-[15px] font-black leading-snug text-white drop-shadow-lg line-clamp-2">{product.title}</h2>
                <div className="mt-1 flex items-center gap-3 text-[11px] font-semibold text-white/70">
                  <span><Star size={11} className="inline text-[#F59E0B] mr-0.5" fill="currentColor" />{product.rating.toFixed(1)}</span>
                  {product.isEstimatedSocial
                    ? <span>Popular</span>
                    : <span>{product.orders.toLocaleString()}+ vândute</span>
                  }
                  <span><Truck size={11} className="inline mr-0.5" />{product.deliveryDays}z</span>
                </div>
              </div>

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
                  type="button"
                  onClick={() => handleAddToCart(product)}
                  style={{ touchAction: "manipulation" }}
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

      {/* Sentinel for infinite scroll — placed 3 items before end */}
      {products.length > 5 && (
        <div ref={sentinelRef} style={{ position: "absolute", bottom: "300vh", height: 1, width: 1 }} />
      )}
      {products.length <= 5 && <div ref={sentinelRef} className="h-10" />}

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#333] border-t-[#10A37F]" />
        </div>
      )}

      {/* Comments slide-up */}
      {showComments && (() => {
        const product = products.find(p => p.id === showComments);
        if (!product) return null;
        return (
          <div className="fixed inset-0 z-[100] flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowComments(null)} />
            <div className="relative flex h-[60vh] flex-col rounded-t-[2rem] bg-white animate-feed-slide">
              <div className="flex items-center justify-between border-b border-[#E5E5E5] px-6 py-4">
                <h3 className="font-black text-[#0D0D0D]">Comentarii ({getRealComments(product)})</h3>
                <button onClick={() => setShowComments(null)} className="rounded-full bg-[#F7F7F8] p-2 text-[#6E6E80]">
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
        );
      })()}
    </div>
  );
}
