"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Flag,
  Heart,
  MessageCircle,
  Package,
  Play,
  ShoppingCart,
  Star,
  Truck,
  Volume2,
  VolumeX,
} from "lucide-react";
import CreatorUpload from "./CreatorUpload";
import CommentsSheet from "./social/CommentsSheet";
import {
  trackEvent as trackFeedEvent,
  flushWatchTime,
  resetWatchTime,
} from "@/lib/feed/track";
import type { FeedEventType } from "@/lib/feed/events";

// Map legacy in-component event names → granular tracking taxonomy.
// Anything not in the map is skipped for the new pipeline (legacy pipeline
// still ships it via /api/v1/events for the Go social service).
const TRACK_EVENT_MAP: Record<string, FeedEventType> = {
  video_impression: "impression",
  video_view: "video_view",
  video_play: "video_view",
  video_pause: "pause",
  video_complete: "completion",
  video_completion: "completion",
  watch_time: "watch_time",
  skip_fast: "skip_fast",
  video_like: "like",
  video_unlike: "unlike",
  video_save: "save",
  video_unsave: "unsave",
  video_share: "share",
  video_comment: "comment",
  creator_follow: "follow",
  creator_unfollow: "unfollow",
  product_click: "product_click",
  add_to_cart: "add_to_cart",
  not_interested: "not_interested",
  more_like_this: "more_like_this",
  report: "report",
  purchase: "purchase",
};

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
  product_id?: string | number;
  productId?: string | number;
  video_id?: string | number;
  videoId?: string | number;
  creator_id?: string;
  creatorId?: string;
};

type Props = {
  products: FeedProduct[];
  onAddToCart: (p: FeedProduct, qty?: number) => void;
  onLoadMore?: () => void;
  onClose?: () => void;
  isLoading: boolean;
};

type FeedEvent = {
  type: string;
  actor_id?: string;
  subject_type: string;
  subject_id: string;
  metadata?: Record<string, unknown>;
  occurred_at: string;
};

const PRODUCT_EVENT_TYPES = new Set(["product_click", "add_to_cart", "checkout_start", "purchase_complete"]);
const CREATOR_EVENT_TYPES = new Set(["profile_open", "follow_creator"]);

function firstEventId(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const id = String(value).trim();
    if (id) return id;
  }
  return "";
}

function productEventId(product: FeedProduct) {
  return firstEventId(product.product_id, product.productId, product.pgId, product.id);
}

function videoEventId(product: FeedProduct) {
  return firstEventId(product.video_id, product.videoId, product.id);
}

function creatorEventId(product: FeedProduct) {
  return firstEventId(product.creator_id, product.creatorId, "swypik");
}

function eventSubject(type: string, product: FeedProduct) {
  if (CREATOR_EVENT_TYPES.has(type)) return { subject_type: "creator", subject_id: creatorEventId(product) };
  if (PRODUCT_EVENT_TYPES.has(type)) return { subject_type: "product", subject_id: productEventId(product) };
  const videoId = videoEventId(product);
  return videoId ? { subject_type: "video", subject_id: videoId } : { subject_type: "product", subject_id: productEventId(product) };
}

function aiOverlay(product: FeedProduct) {
  if (product.commerceBadge) return product.commerceBadge;
  if (product.discountPercent >= 20) return "Deal bun";
  if (product.rating >= 4.8) return "Top calitate";
  if ((product.orders || 0) > 250) return "Popular";
  return "AI Pick";
}

function getRealLikes(product: FeedProduct) {
  const seed = product.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return product.likes || Math.floor((product.orders || 40) * 0.35) + (seed % 150);
}

function getRealComments(product: FeedProduct) {
  const seed = product.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return product.commentCount || Math.floor((product.orders || 10) * 0.04) + (seed % 30);
}

export default function ProductFeed({ products, onAddToCart, onLoadMore, onClose, isLoading }: Props) {
  const router = useRouter();
  const tapAction = { touchAction: "manipulation" } as const;
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const videoMapRef = useRef<Record<string, HTMLVideoElement>>({});
  const sessionIdRef = useRef("");
  const eventQueueRef = useRef<FeedEvent[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenViewRef = useRef(new Set<string>());
  const [currentIdx, setCurrentIdx] = useState(0);
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [heartBurst, setHeartBurst] = useState<string | null>(null);
  const [videoErrors, setVideoErrors] = useState<Record<string, boolean>>({});
  const [isMuted, setIsMuted] = useState(true);
  const [addedToCart, setAddedToCart] = useState<string | null>(null);
  const [showComments, setShowComments] = useState<string | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  const getSessionId = useCallback(() => {
    if (sessionIdRef.current) return sessionIdRef.current;
    try {
      const stored = window.localStorage.getItem("aicv_feed_session_id");
      if (stored) {
        sessionIdRef.current = stored;
        return stored;
      }
    } catch {}

    const next =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `feed_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    sessionIdRef.current = next;
    try {
      window.localStorage.setItem("aicv_feed_session_id", next);
    } catch {}
    return next;
  }, []);

  const flushFeedEvents = useCallback((useBeacon = false) => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const events = eventQueueRef.current.splice(0);
    if (events.length === 0) return;

    const sessionId = getSessionId();
    const eventsWithActor = events.map((event) => ({
      ...event,
      actor_id: event.actor_id || sessionId,
      metadata: { session_id: sessionId, ...(event.metadata || {}) },
    }));
    const batchBody = JSON.stringify({ events: eventsWithActor });
    const sendLegacyFallback = () => {
      eventsWithActor.forEach((event) => {
        fetch("/api/v1/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event),
          keepalive: true,
        }).catch(() => {});
      });
    };

    if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      try {
        const blob = new Blob([batchBody], { type: "application/json" });
        if (navigator.sendBeacon("/api/v1/events/batch", blob)) return;
      } catch {}
    }

    fetch("/api/v1/events/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: batchBody,
      keepalive: true,
    })
      .then((res) => {
        if (!res.ok) sendLegacyFallback();
      })
      .catch(sendLegacyFallback);
  }, [getSessionId]);

  const sendFeedEvent = useCallback((type: string, product: FeedProduct, details: Record<string, unknown> = {}) => {
    const { watchMs, positionMs, ...metadata } = details;
    const subject = eventSubject(type, product);
    eventQueueRef.current.push({
      type,
      actor_id: getSessionId(),
      subject_type: subject.subject_type,
      subject_id: subject.subject_id,
      occurred_at: new Date().toISOString(),
      metadata: {
        source: "next-feed",
        product_id: productEventId(product),
        video_id: videoEventId(product),
        creator_id: creatorEventId(product),
        ...(typeof watchMs === "number" ? { watch_ms: Math.max(0, Math.trunc(watchMs)) } : {}),
        ...(typeof positionMs === "number" ? { position_ms: Math.max(0, Math.trunc(positionMs)) } : {}),
        ...metadata,
      },
    });

    // Parallel emit to the granular ranking pipeline (lib/feed/track).
    const mapped = TRACK_EVENT_MAP[type];
    const videoId = videoEventId(product);
    if (mapped && videoId) {
      trackFeedEvent(mapped, {
        video_id: videoId,
        watch_ms: typeof watchMs === "number" ? Math.max(0, Math.trunc(watchMs)) : undefined,
        position_ms: typeof positionMs === "number" ? Math.max(0, Math.trunc(positionMs)) : undefined,
        metadata: {
          product_id: productEventId(product),
          creator_id: creatorEventId(product),
          source: "product-feed",
          ...metadata,
        },
      });
      if (mapped === "completion") resetWatchTime(videoId);
      if (mapped === "pause" || mapped === "skip_fast") flushWatchTime(videoId);
    }

    if (eventQueueRef.current.length >= 10) {
      flushFeedEvents();
      return;
    }
    if (!flushTimerRef.current) flushTimerRef.current = setTimeout(() => flushFeedEvents(), 2500);
  }, [flushFeedEvents, getSessionId]);

  useEffect(() => {
    const flushOnHide = () => {
      if (document.visibilityState === "hidden") flushFeedEvents(true);
    };
    window.addEventListener("pagehide", () => flushFeedEvents(true));
    document.addEventListener("visibilitychange", flushOnHide);
    return () => {
      document.removeEventListener("visibilitychange", flushOnHide);
      flushFeedEvents(true);
    };
  }, [flushFeedEvents]);

  useEffect(() => {
    const product = products[currentIdx];
    if (!product || seenViewRef.current.has(product.id)) return;
    seenViewRef.current.add(product.id);
    sendFeedEvent("video_impression", product, { position: currentIdx });
  }, [currentIdx, products, sendFeedEvent]);

  // skip_fast detection: when the user swipes to the next card in under 1s
  // since the previous card became active, emit `skip_fast` on the previous
  // card. This is the strongest negative signal for the ranker.
  const lastIdxRef = useRef<{ idx: number; at: number } | null>(null);
  useEffect(() => {
    const prev = lastIdxRef.current;
    const now = Date.now();
    if (prev && prev.idx !== currentIdx) {
      const elapsed = now - prev.at;
      const prevProduct = products[prev.idx];
      if (prevProduct && elapsed < 1000) {
        sendFeedEvent("skip_fast", prevProduct, {
          position: prev.idx,
          watchMs: elapsed,
        });
      }
    }
    lastIdxRef.current = { idx: currentIdx, at: now };
  }, [currentIdx, products, sendFeedEvent]);

  useEffect(() => {
    if (!sentinelRef.current || !onLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { root: scrollRef.current, threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [onLoadMore, products.length]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const cards = scrollRef.current.querySelectorAll("[data-feed-idx]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const idx = Number(entry.target.getAttribute("data-feed-idx"));
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) setCurrentIdx(idx);
        });
      },
      { root: scrollRef.current, threshold: [0, 0.6] }
    );
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [products]);

  useEffect(() => {
    const product = products[currentIdx];
    if (!product) return;
    Object.entries(videoMapRef.current).forEach(([id, video]) => {
      video.muted = isMuted;
      if (id === product.id) video.play().catch(() => {});
      else video.pause();
    });
  }, [currentIdx, isMuted, products]);

  const openProduct = useCallback((product: FeedProduct) => {
    sendFeedEvent("product_click", product, { position: currentIdx });
    router.push(`/product/${product.pgId || product.id}`);
  }, [currentIdx, router, sendFeedEvent]);

  const toggleLike = (product: FeedProduct) => {
    const isNextLiked = !likes[product.id];
    setLikes((prev) => ({ ...prev, [product.id]: isNextLiked }));
    sendFeedEvent(isNextLiked ? "video_like" : "video_unlike", product, { position: currentIdx });
    const videoId = videoEventId(product);
    if (videoId) {
      fetch(`/api/videos/${videoId}/like`, { method: "POST" }).catch(() => {});
    }
    if (isNextLiked) {
      setHeartBurst(product.id);
      setTimeout(() => setHeartBurst(null), 900);
    }
  };

  const handleAddToCart = (product: FeedProduct) => {
    sendFeedEvent("add_to_cart", product, { position: currentIdx, quantity: 1 });
    onAddToCart(product, 1);
    setAddedToCart(product.id);
    setTimeout(() => setAddedToCart(null), 2000);
  };

  const handleReport = (product: FeedProduct) => {
    sendFeedEvent("report", product, { position: currentIdx });
    if (typeof window !== "undefined") {
      window.alert("Mulțumim pentru raport. Echipa noastră va analiza acest clip.");
    }
  };

  if (isLoading && products.length === 0) {
    return (
      <div className="feed-scroll flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#333] border-t-[#0D0D0D]" />
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
      <div className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between px-4" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
        {onClose ? (
          <button type="button" onClick={onClose} className="rounded-full bg-black/50 p-2.5 text-white backdrop-blur-sm" style={tapAction} aria-label="Close feed">
            <ArrowLeft size={20} />
          </button>
        ) : <span />}
        <div className="flex items-center gap-2">
          <CreatorUpload />
          <button
            type="button"
            onClick={() => setIsMuted((value) => !value)}
            className="rounded-full bg-black/50 p-2.5 text-white backdrop-blur-sm"
            style={tapAction}
            aria-label={isMuted ? "Unmute feed" : "Mute feed"}
          >
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>
      </div>

      {products.map((product, idx) => {
        const posterImage = product.images?.[0];
        const hasWorkingVideo = Boolean(product.video && !videoErrors[product.id]);
        return (
          <div key={product.id} data-feed-idx={idx} className="feed-card">
            <div className="feed-media">
              {posterImage ? (
                <Image
                  src={posterImage}
                  alt={product.title}
                  fill
                  sizes="100vw"
                  loading={idx < 3 ? "eager" : "lazy"}
                  priority={idx === 0}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center bg-[#0D0D0D] text-white/50">
                  <Package size={48} />
                </div>
              )}
              {hasWorkingVideo && Math.abs(idx - currentIdx) <= 1 && (
                <video
                  ref={(el) => {
                    if (el) videoMapRef.current[product.id] = el;
                  }}
                  src={product.video!}
                  poster={posterImage}
                  loop
                  muted={isMuted}
                  playsInline
                  preload={idx === currentIdx ? "auto" : "metadata"}
                  autoPlay={idx === currentIdx}
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={() => setVideoErrors((prev) => ({ ...prev, [product.id]: true }))}
                />
              )}
              {hasWorkingVideo && Math.abs(idx - currentIdx) > 1 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="grid h-14 w-14 place-items-center rounded-full bg-white/20 backdrop-blur-sm">
                    <Play size={28} className="ml-0.5 text-white" fill="white" />
                  </div>
                </div>
              )}
            </div>

            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

            {heartBurst === product.id && (
              <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                <Heart className="animate-like-burst text-[#EF4444]" size={100} fill="currentColor" />
              </div>
            )}

            <div className="absolute bottom-48 right-3 z-20 flex flex-col items-center gap-4">
              <button type="button" onClick={() => toggleLike(product)} className="flex flex-col items-center gap-0.5" style={tapAction} aria-label={likes[product.id] ? "Unlike" : "Like"}>
                <div className={`rounded-full p-3 shadow-lg ${likes[product.id] ? "bg-[#EF4444] text-white" : "bg-black/30 backdrop-blur-sm text-white"}`}>
                  <Heart size={24} fill={likes[product.id] ? "currentColor" : "none"} />
                </div>
                <span className="text-[10px] font-bold text-white/90">{getRealLikes(product) + (likes[product.id] ? 1 : 0)}</span>
              </button>
              <button type="button" onClick={() => setShowComments(product.id)} className="flex flex-col items-center gap-0.5" style={tapAction} aria-label="Open comments">
                <div className="rounded-full bg-black/30 backdrop-blur-sm p-3 text-white shadow-lg">
                  <MessageCircle size={24} />
                </div>
                <span className="text-[10px] font-bold text-white/90">{commentCounts[product.id] ?? getRealComments(product)}</span>
              </button>
              <button type="button" onClick={() => openProduct(product)} className="flex flex-col items-center gap-0.5" style={tapAction} aria-label="Open product details">
                <div className="rounded-full bg-black/30 backdrop-blur-sm p-3 text-white shadow-lg">
                  <ShoppingCart size={24} />
                </div>
                <span className="text-[10px] font-bold text-white/90">Detalii</span>
              </button>
              <button type="button" onClick={() => handleReport(product)} className="flex flex-col items-center gap-0.5" style={tapAction} aria-label="Raporteaza">
                <div className="rounded-full bg-black/30 backdrop-blur-sm p-3 text-white shadow-lg">
                  <Flag size={20} />
                </div>
                <span className="text-[10px] font-bold text-white/90">Raport</span>
              </button>
            </div>

            <div className="absolute bottom-0 left-0 right-0 z-20 px-4" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
              <div className="mb-3">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-black text-white backdrop-blur-sm">{aiOverlay(product)}</span>
                  {product.discountPercent > 0 && <span className="rounded-full bg-[#EF4444] px-2.5 py-0.5 text-[10px] font-black text-white">-{product.discountPercent}%</span>}
                </div>
                <h2 className="line-clamp-2 text-[15px] font-black leading-snug text-white drop-shadow-lg">{product.title}</h2>
                <div className="mt-1 flex items-center gap-3 text-[11px] font-semibold text-white/70">
                  <span><Star size={11} className="mr-0.5 inline text-[#F59E0B]" fill="currentColor" />{product.rating.toFixed(1)}</span>
                  <span>{product.isEstimatedSocial ? "Popular" : `${product.orders.toLocaleString()}+ vândute`}</span>
                  <span><Truck size={11} className="mr-0.5 inline" />{product.deliveryDays}z</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <span className="text-2xl font-black text-white">{product.price} lei</span>
                  {product.oldPrice > product.price && <span className="ml-2 text-sm text-white/40 line-through">{product.oldPrice} lei</span>}
                </div>
                <button
                  type="button"
                  onClick={() => handleAddToCart(product)}
                  style={tapAction}
                  className={`rounded-2xl px-5 py-3 text-sm font-black shadow-lg transition-all active:scale-[0.95] ${
                    addedToCart === product.id ? "bg-white text-[#0D0D0D]" : "bg-[#0D0D0D] text-white shadow-[0_4px_20px_rgba(16,163,127,0.4)]"
                  }`}
                >
                  {addedToCart === product.id ? "Adăugat" : <><ShoppingCart size={15} className="mr-1 inline" />Coș</>}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      <div ref={sentinelRef} className="h-10" />

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#333] border-t-[#0D0D0D]" />
        </div>
      )}

      {showComments && (() => {
        const product = products.find((item) => item.id === showComments);
        const videoId = product ? videoEventId(product) : "";
        if (!product || !videoId) return null;
        return (
          <CommentsSheet
            open={Boolean(showComments)}
            videoId={videoId}
            initialCount={commentCounts[product.id] ?? product.commentCount}
            onClose={() => setShowComments(null)}
            onCountChange={(nextCount) => {
              setCommentCounts((current) => ({ ...current, [product.id]: nextCount }));
            }}
          />
        );
      })()}
    </div>
  );
}
