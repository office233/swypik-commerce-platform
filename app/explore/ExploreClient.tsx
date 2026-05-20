"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Bookmark, Coins, MessageCircle, Scale, Search, ShoppingCart, Sparkles, ThumbsDown, ThumbsUp, Volume2, VolumeX } from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import { useHlsVideo } from "@/lib/video/useHlsVideo";
import { haptic } from "@/lib/haptic";
import { trackEvent as trackFeedEvent, trackWatchTime, flushWatchTime, resetWatchTime, getSessionId } from "@/lib/feed/track";

const ProductDrawer = dynamic(() => import("@/components/ProductDrawer"), { ssr: false });
const CommentsSheet = dynamic(() => import("@/components/social/CommentsSheet"), { ssr: false });

const MUTE_STORAGE_KEY = "swypik.feed.muted";
// Mount range: only render real <video src> for slides within ±MOUNT_RADIUS of currentIndex
const MOUNT_RADIUS = 1;
const FEED_FORMATS = ["Merită?", "Sub 50", "Testate", "Swypik Finds", "Selleri locali", "Battles", "Live Deals"];

function getProductVerdict(product: any): string {
  const score = Number(product?.swypikScore || 0);
  const price = Number(product?.priceCents || 0);
  const delivery = String(product?.deliveryLabel || "").toLowerCase();
  const title = String(product?.name || product?.title || "").toLowerCase();
  if (score >= 86) return "Preț bun";
  if (delivery.includes("livrare") && /[5-9][0-9]\.|[1-9][0-9]{2}/.test(delivery)) return "Verifică livrarea";
  if (price > 0 && price <= 5000) return "Sub 50 lei";
  if (title.includes("viral") || title.includes("trending")) return "Trending azi";
  if (score < 55) return "Risc de verificat";
  return "AI verdict rapid";
}

function withOptimisticVote(product: any, vote: "worth_it" | "not_worth_it") {
  const votes = product?.votes || {};
  const previousVote = votes.viewerVote || null;
  let worthIt = Number(votes.worthIt || 0);
  let notWorthIt = Number(votes.notWorthIt || 0);
  if (previousVote === "worth_it") worthIt = Math.max(0, worthIt - 1);
  if (previousVote === "not_worth_it") notWorthIt = Math.max(0, notWorthIt - 1);
  if (vote === "worth_it") worthIt += 1;
  if (vote === "not_worth_it") notWorthIt += 1;
  return {
    ...product,
    votes: { worthIt, notWorthIt, total: worthIt + notWorthIt, viewerVote: vote },
  };
}

interface FeedVideoProps {
  videoId: string;
  src: string | null | undefined;
  hlsUrl: string | null | undefined;
  fallbackSrc?: string | null | undefined;
  poster: string | null | undefined;
  isCurrent: boolean;
  muted: boolean;
  registerRef: (id: string, el: HTMLVideoElement | null) => void;
  onTap: () => void;
  onTimeUpdate: (videoId: string, ratio: number, currentTime: number) => void;
}

function FeedVideo({ videoId, src, hlsUrl, fallbackSrc, poster, isCurrent, muted, registerRef, onTap, onTimeUpdate }: FeedVideoProps) {
  // The component is rendered only for the current slide and its nearest
  // neighbors; give neighbors a real src too so the next swipe has metadata
  // and the first HLS segment ready instead of starting from zero.
  const effectiveSrc = hlsUrl || src || undefined;
  const hlsRef = useHlsVideo(effectiveSrc, fallbackSrc || src || undefined);

  // bridge the hls hook ref into the parent map
  useEffect(() => {
    registerRef(videoId, hlsRef.current);
    return () => registerRef(videoId, null);
  }, [videoId, registerRef, hlsRef]);

  return (
    <video
      ref={hlsRef}
      poster={poster || undefined}
      loop
      muted={muted}
      playsInline
      preload={isCurrent ? "auto" : "metadata"}
      onClick={onTap}
      onTimeUpdate={(e) => {
        const v = e.currentTarget;
        if (v.duration) onTimeUpdate(videoId, v.currentTime / v.duration, v.currentTime);
      }}
    />
  );
}

function ExplorePageInner({ initialVideos, initialCategory }: { initialVideos: any[]; initialCategory?: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialVideoId = searchParams.get("v");

  const [videos, setVideos] = useState<any[]>(initialVideos || []);
  const [loading, setLoading] = useState((initialVideos?.length || 0) === 0);
  const [feedSource, setFeedSource] = useState<"foryou" | "following">("foryou");
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeProduct, setActiveProduct] = useState<any | null>(null);
  const [activeCommentsVideo, setActiveCommentsVideo] = useState<any | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [activeFormat, setActiveFormat] = useState(FEED_FORMATS[0]);
  const [aiPrompt, setAiPrompt] = useState("");
  const [voteBusyKey, setVoteBusyKey] = useState<string | null>(null);
  const [coinBurst, setCoinBurst] = useState<{ videoId: string; nonce: number } | null>(null);
  const [cartBusyProductId, setCartBusyProductId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(MUTE_STORAGE_KEY);
      if (stored === "0") setIsMuted(false);
    } catch {}
  }, []);

  const [likedVideos, setLikedVideos] = useState<Set<string>>(new Set());
  const [savedVideos, setSavedVideos] = useState<Set<string>>(new Set());
  const [followingCreators, setFollowingCreators] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const progressBarRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const currentTimeRefs = useRef<Map<string, { current: number }>>(new Map());

  const viewedVideosRef = useRef<Set<string>>(new Set());
  const sessionIdRef = useRef<string>("");
  const deepLinkHandledRef = useRef(false);

  const registerVideoRef = useCallback((id: string, el: HTMLVideoElement | null) => {
    if (el) videoRefs.current.set(id, el);
    else videoRefs.current.delete(id);
  }, []);

  const handleTimeUpdate = useCallback((videoId: string, ratio: number, currentTime: number) => {
    // ref-based progress update — no setState, no re-render
    const bar = progressBarRefs.current.get(videoId);
    if (bar) bar.style.transform = `scaleX(${Math.min(1, Math.max(0, ratio))})`;
    let ctRef = currentTimeRefs.current.get(videoId);
    if (!ctRef) { ctRef = { current: 0 }; currentTimeRefs.current.set(videoId, ctRef); }
    ctRef.current = currentTime;
    // batched watch_time tick
    trackWatchTime(videoId, Math.round(currentTime * 1000));
  }, []);

  const trackEvent = useCallback((videoId: string, eventType: string, data?: any) => {
    // Route via batched client. Map legacy event names to canonical FeedEventType.
    const map: Record<string, string> = {
      impression: "impression",
      like: "like",
      unlike: "unlike",
      save: "save",
      unsave: "unsave",
      share: "share",
      buy_now: "product_click",
      add_to_cart: "add_to_cart",
    };
    const mapped = (map[eventType] || eventType) as any;
    try {
      trackFeedEvent(mapped, { video_id: videoId, metadata: data });
    } catch {}
  }, []);

  const sendView = useCallback((videoId: string) => {
    if (viewedVideosRef.current.has(videoId)) return;
    viewedVideosRef.current.add(videoId);
    // legacy server counter
    fetch(`/api/videos/${videoId}/view`, { method: "POST" }).catch(() => {});
    // batched feed event
    try { trackFeedEvent("video_view" as any, { video_id: videoId }); } catch {}
  }, []);

  useEffect(() => {
    if (!sessionIdRef.current && typeof window !== "undefined") {
      // use shared feed session (also used by lib/feed/track)
      sessionIdRef.current = getSessionId();
    }

    async function fetchVideos() {
      try {
        const catQs = initialCategory ? `&taxonomy_node_slug=${encodeURIComponent(initialCategory)}` : "";
        const sessionQs = sessionIdRef.current ? `&session_id=${encodeURIComponent(sessionIdRef.current)}` : "";
        const url = feedSource === "following"
          ? `/api/explore/feed?limit=30&source=following${catQs}${sessionQs}`
          : `/api/explore/feed?limit=30${catQs}${sessionQs}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const nextVideos = data.videos || [];
          setVideos(nextVideos);
          setLikedVideos(new Set(nextVideos.filter((video: any) => video.viewer?.liked).map((video: any) => video.id)));
          setSavedVideos(new Set(nextVideos.filter((video: any) => video.viewer?.saved).map((video: any) => video.id)));
          setFollowingCreators(new Set(nextVideos.filter((video: any) => video.viewer?.following).map((video: any) => video.creator?.id).filter(Boolean)));
        }
      } catch (err) {
        console.error("Error fetching videos:", err);
      } finally {
        setLoading(false);
      }
    }
    if (initialVideos && initialVideos.length >= 20 && feedSource === 'foryou') {
      // skip initial fetch only when the server provided a full first batch
      const seeded = initialVideos;
      setLikedVideos(new Set(seeded.filter((v: any) => v.viewer?.liked).map((v: any) => v.id)));
      setSavedVideos(new Set(seeded.filter((v: any) => v.viewer?.saved).map((v: any) => v.id)));
      setFollowingCreators(new Set(seeded.filter((v: any) => v.viewer?.following).map((v: any) => v.creator?.id).filter(Boolean)));
      setLoading(false);
      return;
    }
    fetchVideos();
  }, [feedSource, initialCategory, initialVideos]);

  // Intersection Observer — snap play/pause + currentIndex tracking
  useEffect(() => {
    if (videos.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target as HTMLElement;
          const videoId = el.getAttribute("data-video-id");
          const idxAttr = el.getAttribute("data-video-idx");
          const idx = idxAttr ? parseInt(idxAttr, 10) : -1;
          const videoEl = videoRefs.current.get(videoId || "");
          if (!videoId) return;

          if (entry.isIntersecting) {
            setActiveVideoId(videoId);
            if (idx >= 0) setCurrentIndex(idx);
            if (videoEl) {
              videoEl.currentTime = 0;
              videoEl.play().catch(() => {});
            }
            trackEvent(videoId, "impression");

            // 3s view timer with cleanup on unobserve
            const t = window.setTimeout(() => sendView(videoId), 3000);
            (el as any).__viewTimer = t;
          } else {
            if (videoEl) videoEl.pause();
            const t = (el as any).__viewTimer;
            if (t) {
              clearTimeout(t);
              (el as any).__viewTimer = null;
            }
            // flush residual watch_time when slide leaves viewport
            if (videoId) {
              flushWatchTime(videoId);
              resetWatchTime(videoId);
            }
          }
        });
      },
      { root: containerRef.current, threshold: 0.7 }
    );

    const containers = containerRef.current?.querySelectorAll("[data-video-id]");
    containers?.forEach((el) => observer.observe(el));

    return () => {
      // clear pending view timers
      containers?.forEach((el) => {
        const t = (el as any).__viewTimer;
        if (t) clearTimeout(t);
      });
      observer.disconnect();
    };
  }, [videos, sendView, trackEvent]);

  // Deep-link `?v=<id>` — scroll to slide once after first load
  useEffect(() => {
    if (deepLinkHandledRef.current || !initialVideoId || videos.length === 0) return;
    const idx = videos.findIndex((v) => v.id === initialVideoId);
    if (idx < 0) return;
    const el = containerRef.current?.querySelector(`[data-video-idx="${idx}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: "auto", block: "start" });
      deepLinkHandledRef.current = true;
    }
  }, [initialVideoId, videos]);

  useEffect(() => {
    if (activeProduct) {
      videoRefs.current.forEach((v) => v.pause());
    } else if (activeVideoId) {
      videoRefs.current.get(activeVideoId)?.play().catch(() => {});
    }
  }, [activeProduct, activeVideoId]);

  const toggleMute = useCallback(() => {
    haptic("tap");
    setIsMuted(prev => {
      const next = !prev;
      videoRefs.current.forEach((v) => { v.muted = next; });
      try { window.localStorage.setItem(MUTE_STORAGE_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);

  const countValue = (value: string | number | null | undefined) => {
    const parsed = typeof value === "string" ? parseInt(value, 10) : Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };

  const updateVideo = useCallback((videoId: string, changes: Record<string, any>) => {
    setVideos((current) =>
      current.map((video) =>
        video.id === videoId
          ? { ...video, ...changes, viewer: { ...(video.viewer || {}), ...(changes.viewer || {}) } }
          : video,
      ),
    );
  }, []);

  const handleLike = useCallback(async (videoId: string) => {
    haptic("tap");
    const wasLiked = likedVideos.has(videoId);
    const nextLiked = !wasLiked;
    const video = videos.find((item) => item.id === videoId);
    const previousCount = countValue(video?.likes);

    setLikedVideos(prev => {
      const next = new Set(prev);
      if (nextLiked) next.add(videoId); else next.delete(videoId);
      return next;
    });
    updateVideo(videoId, {
      likes: String(Math.max(0, previousCount + (nextLiked ? 1 : -1))),
      viewer: { liked: nextLiked },
    });
    trackEvent(videoId, nextLiked ? "like" : "unlike");

    try {
      const res = await fetch(`/api/videos/${videoId}/like`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Like failed");

      setLikedVideos(prev => {
        const next = new Set(prev);
        if (data.liked) next.add(videoId); else next.delete(videoId);
        return next;
      });
      updateVideo(videoId, {
        likes: String(data.like_count ?? previousCount),
        viewer: { liked: Boolean(data.liked) },
      });
      if (data.liked) {
        window.dispatchEvent(new CustomEvent('reward', { detail: { points: 3, msg: '+3 XP' } }));
      }
    } catch {
      setLikedVideos(prev => {
        const next = new Set(prev);
        if (wasLiked) next.add(videoId); else next.delete(videoId);
        return next;
      });
      updateVideo(videoId, { likes: String(previousCount), viewer: { liked: wasLiked } });
    }
  }, [likedVideos, trackEvent, updateVideo, videos]);

  const handleSave = useCallback(async (videoId: string) => {
    haptic("tap");
    const wasSaved = savedVideos.has(videoId);
    const nextSaved = !wasSaved;
    const video = videos.find((item) => item.id === videoId);
    const previousCount = countValue(video?.saves);

    setSavedVideos(prev => {
      const next = new Set(prev);
      if (nextSaved) next.add(videoId); else next.delete(videoId);
      return next;
    });
    updateVideo(videoId, {
      saves: String(Math.max(0, previousCount + (nextSaved ? 1 : -1))),
      viewer: { saved: nextSaved },
    });
    trackEvent(videoId, nextSaved ? "save" : "unsave");

    try {
      const res = await fetch(`/api/videos/${videoId}/save`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Save failed");

      setSavedVideos(prev => {
        const next = new Set(prev);
        if (data.saved) next.add(videoId); else next.delete(videoId);
        return next;
      });
      updateVideo(videoId, {
        saves: String(data.save_count ?? previousCount),
        viewer: { saved: Boolean(data.saved) },
      });
      if (data.saved) {
        window.dispatchEvent(new CustomEvent('reward', { detail: { points: 5, msg: 'Salvat +5 XP' } }));
      }
    } catch {
      setSavedVideos(prev => {
        const next = new Set(prev);
        if (wasSaved) next.add(videoId); else next.delete(videoId);
        return next;
      });
      updateVideo(videoId, { saves: String(previousCount), viewer: { saved: wasSaved } });
    }
  }, [savedVideos, trackEvent, updateVideo, videos]);

  const handleShare = useCallback(async (videoId: string) => {
    haptic("tap");
    const video = videos.find((item) => item.id === videoId);
    const previousCount = countValue(video?.shares);
    const shareUrl = `${window.location.origin}/explore?v=${videoId}`;
    let channel = "copy_link";

    try {
      if (navigator.share) {
        channel = "native_share";
        await navigator.share({ title: 'Swypik Video', url: shareUrl }).catch(() => {});
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl).catch(() => {});
        setShareToast("Link copiat în clipboard");
        setTimeout(() => setShareToast(null), 1800);
      }
      const res = await fetch(`/api/videos/${videoId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, referrer_url: window.location.href }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Share failed");

      updateVideo(videoId, { shares: String(data.share_count ?? previousCount + 1) });
      trackEvent(videoId, "share", { channel });
      window.dispatchEvent(new CustomEvent('reward', { detail: { points: 15, msg: 'Share +15 XP' } }));
    } catch {}
  }, [trackEvent, updateVideo, videos]);

  const handleFollow = useCallback(async (creatorId: string) => {
    if (!creatorId) return;
    haptic("tap");
    const wasFollowing = followingCreators.has(creatorId);
    const nextFollowing = !wasFollowing;

    setFollowingCreators(prev => {
      const next = new Set(prev);
      if (nextFollowing) next.add(creatorId); else next.delete(creatorId);
      return next;
    });

    try {
      const res = await fetch(`/api/users/${creatorId}/follow`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Follow failed");

      setFollowingCreators(prev => {
        const next = new Set(prev);
        if (data.following) next.add(creatorId); else next.delete(creatorId);
        return next;
      });
      setVideos((current) =>
        current.map((video) =>
          video.creator?.id === creatorId
            ? { ...video, viewer: { ...(video.viewer || {}), following: Boolean(data.following) } }
            : video,
        ),
      );
    } catch {
      setFollowingCreators(prev => {
        const next = new Set(prev);
        if (wasFollowing) next.add(creatorId); else next.delete(creatorId);
        return next;
      });
    }
  }, [followingCreators]);

  const openProduct = useCallback((video: any) => {
    if (!video.product?.id) {
      setActiveProduct(null);
      return;
    }
    trackEvent(video.id, "product_click", { product_id: video.product.id, surface: "feed_chip" });
    // Open instantly with the data we already have from the feed.
    // ProductDrawer enriches in background if description is missing.
    setActiveProduct({ ...video.product, videoId: video.id });
  }, [trackEvent]);

  const handleProductVote = useCallback(async (video: any, vote: "worth_it" | "not_worth_it") => {
    if (!video?.id || !video.product?.id || video.product?.votes?.viewerVote === vote) return;
    haptic("tap");
    const previousProduct = video.product;
    const nextProduct = withOptimisticVote(previousProduct, vote);
    const busyKey = `${video.id}:${vote}`;
    setVoteBusyKey(busyKey);
    updateVideo(video.id, { product: nextProduct });
    const burstNonce = Date.now();
    setCoinBurst({ videoId: video.id, nonce: burstNonce });
    window.setTimeout(() => {
      setCoinBurst((current) => current?.nonce === burstNonce ? null : current);
    }, 900);

    try {
      const sessionId = sessionIdRef.current || getSessionId();
      sessionIdRef.current = sessionId;
      const res = await fetch(`/api/videos/${video.id}/product-vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productId: String(video.product.id), vote, sessionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "vote_failed");
      updateVideo(video.id, { product: { ...nextProduct, votes: data.votes } });
      trackEvent(video.id, "product_click", { product_id: video.product.id, action: "feed_vote", vote });
      window.dispatchEvent(new CustomEvent("reward", { detail: { points: 8, msg: "Vot +8 XP" } }));
    } catch {
      updateVideo(video.id, { product: previousProduct });
      setShareToast("Votul nu s-a salvat");
      setTimeout(() => setShareToast(null), 1600);
    } finally {
      setVoteBusyKey(null);
    }
  }, [trackEvent, updateVideo]);

  const handleAddProductToCart = useCallback(async (video: any) => {
    if (!video?.product?.id || cartBusyProductId === String(video.product.id)) return;
    haptic("tap");
    setCartBusyProductId(String(video.product.id));
    try {
      const product = video.product;
      const res = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productId: String(product.id),
          quantity: 1,
          title: product.name || product.title || "Produs",
          image: product.image || product.image_url || null,
          priceCents: product.priceCents || undefined,
          currency: product.currency || "RON",
        }),
      });
      if (!res.ok) throw new Error("cart_failed");
      trackEvent(video.id, "add_to_cart", { product_id: product.id, surface: "feed_cockpit" });
      setShareToast("Adăugat în coș");
      window.dispatchEvent(new CustomEvent("reward", { detail: { points: 10, msg: "Coș +10 XP" } }));
    } catch {
      setShareToast("Coșul nu s-a actualizat");
    } finally {
      setCartBusyProductId(null);
      setTimeout(() => setShareToast(null), 1600);
    }
  }, [cartBusyProductId, trackEvent]);

  const submitAiPrompt = useCallback(() => {
    const q = aiPrompt.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }, [aiPrompt, router]);

  const formatCount = (n: string | number) => {
    const num = typeof n === 'string' ? parseInt(n) : n;
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return String(num || 0);
  };

  return (
    <main className="explore-root" aria-label="Discover videos">
      <h1 className="sr-only">Descoperă videoclipuri Swypik</h1>
      <style dangerouslySetInnerHTML={{__html: `
        :root { --feed-bottom-nav: 64px; --feed-safe-bottom: env(safe-area-inset-bottom, 0px); --feed-action-bottom: calc(var(--feed-bottom-nav) + var(--feed-safe-bottom) + 16px); --feed-content-bottom: calc(var(--feed-bottom-nav) + var(--feed-safe-bottom) + 12px); }
        .explore-root { position: fixed; inset: env(safe-area-inset-top, 0px) 0 0 0; background: #000; color: #fff; overflow: hidden; min-height: 100dvh; }
        .explore-root * { box-sizing: border-box; }
        .feed-scroll { height: 100%; width: 100%; overflow-y: scroll; scroll-snap-type: y mandatory; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
        .feed-scroll::-webkit-scrollbar { display: none; }
        .video-slide { height: 100dvh; width: 100%; min-height: 100%; scroll-snap-align: center; position: relative; display: flex; align-items: center; justify-content: center; background: #000; }
        .video-slide video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        .video-slide .poster-fallback { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        .video-gradient { position: absolute; bottom: 0; left: 0; right: 0; height: 55%; pointer-events: none; background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 40%, transparent 100%); }
        .video-gradient-top { position: absolute; top: 0; left: 0; right: 0; height: 120px; pointer-events: none; background: linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%); }
        .feed-topbar { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 12px); left: max(12px, calc(12px + env(safe-area-inset-left, 0px))); right: max(64px, calc(64px + env(safe-area-inset-right, 0px))); z-index: 30; display: flex; flex-direction: column; gap: 10px; pointer-events: auto; }
        .ai-search { height: 42px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.16); background: rgba(12,12,14,0.58); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: 0 12px 34px rgba(0,0,0,0.25); }
        .ai-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: #fff; font-size: 14px; font-weight: 650; }
        .ai-search input::placeholder { color: rgba(255,255,255,0.72); }
        .format-tabs { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
        .format-tabs::-webkit-scrollbar { display: none; }
        .format-tab { flex: 0 0 auto; min-height: 32px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.10); color: rgba(255,255,255,0.86); padding: 0 12px; font-size: 12px; font-weight: 800; backdrop-filter: blur(12px); }
        .format-tab.active { background: #FDE047; color: #111; border-color: #FDE047; }
        .product-cockpit { position: absolute; left: max(8px, calc(8px + env(safe-area-inset-left, 0px))); right: max(8px, calc(8px + env(safe-area-inset-right, 0px))); bottom: calc(var(--feed-bottom-nav) + var(--feed-safe-bottom) + 10px); z-index: 24; display: flex; flex-direction: column; gap: 4px; max-width: 620px; margin: 0 auto; padding: 6px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.14); background: linear-gradient(180deg, rgba(18,16,18,0.62), rgba(10,10,12,0.84)); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); box-shadow: 0 12px 30px rgba(0,0,0,0.32); pointer-events: auto; }
        .cockpit-meta { position: absolute; left: 6px; right: 6px; top: -25px; display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: 20px; pointer-events: auto; }
        .creator-link { color: #fff; text-decoration: none; font-size: 11px; font-weight: 850; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-shadow: 0 1px 8px rgba(0,0,0,0.88); }
        .verdict-pill { display: inline-flex; align-items: center; gap: 4px; min-height: 20px; padding: 0 7px; border-radius: 999px; background: rgba(16,16,18,0.58); color: #B7F7E6; border: 1px solid rgba(16,163,127,0.34); font-size: 9px; font-weight: 900; white-space: nowrap; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
        .cockpit-main { display: grid; grid-template-columns: 38px minmax(0,1fr) auto; gap: 7px; align-items: center; width: 100%; min-height: 38px; border: 0; background: transparent; color: inherit; padding: 0; cursor: pointer; }
        .cockpit-image { width: 38px; height: 38px; border-radius: 11px; overflow: hidden; background: rgba(255,255,255,0.08); position: relative; }
        .cockpit-image img { width: 100%; height: 100%; object-fit: cover; }
        .cockpit-title { display: block; font-size: 12.5px; line-height: 1.08; font-weight: 850; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cockpit-sub { display: flex; align-items: center; gap: 5px; margin-top: 1px; min-width: 0; color: rgba(255,255,255,0.76); font-size: 9.5px; font-weight: 750; }
        .cockpit-sub span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cockpit-price { font-size: 13px; font-weight: 950; color: #10A37F; white-space: nowrap; }
        .cockpit-score { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .score-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 34px; height: 24px; border-radius: 999px; background: #FDE047; color: #111; font-size: 13px; font-weight: 950; }
        .score-label { color: rgba(255,255,255,0.68); font-size: 8px; font-weight: 800; white-space: nowrap; }
        .cockpit-actions { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 4px; }
        .cockpit-btn { min-width: 0; min-height: 29px; border-radius: 9px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.10); color: #fff; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 3px; font-size: 8.5px; font-weight: 850; line-height: 1.05; padding: 0 4px; }
        .cockpit-btn svg { width: 13px; height: 13px; flex: 0 0 auto; }
        .cockpit-secondary { grid-template-columns: repeat(3, minmax(0,1fr)); }
        .cockpit-secondary .cockpit-btn { min-height: 22px; border-radius: 8px; background: rgba(255,255,255,0.075); font-size: 9px; }
        .cockpit-secondary .cockpit-btn svg { display: none; }
        .cockpit-btn.primary { background: #10A37F; border-color: #10A37F; color: #fff; }
        .cockpit-btn.vote-on { background: #FDE047; border-color: #FDE047; color: #111; }
        .cockpit-btn:active { transform: scale(0.96); }
        .cockpit-btn:disabled { opacity: 0.68; }
        .coin-burst { position: absolute; right: 14px; top: -34px; display: flex; align-items: center; gap: 4px; pointer-events: none; z-index: 3; animation: coinRise 0.9s ease-out forwards; }
        .coin-burst span { width: 28px; height: 28px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: #FDE047; color: #111; border: 1px solid rgba(255,255,255,0.72); box-shadow: 0 8px 20px rgba(253,224,71,0.34); font-size: 11px; font-weight: 950; }
        .coin-burst span:nth-child(2) { animation-delay: 0.05s; transform: translateY(6px); }
        .coin-burst span:nth-child(3) { animation-delay: 0.1s; transform: translateY(2px); }
        .coin-burst svg { width: 14px; height: 14px; }
        @keyframes coinRise { 0% { opacity: 0; transform: translate3d(0, 14px, 0) scale(0.86); } 18% { opacity: 1; } 100% { opacity: 0; transform: translate3d(-8px, -42px, 0) scale(1.08); } }
        @media (max-width: 420px) { .product-cockpit { border-radius: 13px; padding: 6px; gap: 4px; } .cockpit-main { grid-template-columns: 36px minmax(0,1fr) auto; gap: 6px; min-height: 36px; } .cockpit-image { width: 36px; height: 36px; border-radius: 10px; } .cockpit-title { font-size: 11.5px; } .cockpit-price { font-size: 12.5px; } .score-badge { min-width: 32px; height: 23px; font-size: 12px; } .cockpit-btn { min-height: 28px; font-size: 8px; gap: 2px; padding: 0 3px; } .cockpit-secondary .cockpit-btn { min-height: 21px; font-size: 8.5px; } }
        @media (max-height: 640px) { .feed-topbar { gap: 6px; } .ai-search { height: 36px; border-radius: 16px; } .format-tab { min-height: 28px; padding: 0 10px; font-size: 11px; } .product-cockpit { gap: 3px; padding: 6px; } .cockpit-meta { display: none; } .cockpit-main { min-height: 36px; } .cockpit-image { width: 36px; height: 36px; } .cockpit-btn { min-height: 27px; } .cockpit-secondary .cockpit-btn { min-height: 20px; } }
        .action-bar { position: absolute; right: max(10px, calc(10px + env(safe-area-inset-right, 0px))); bottom: var(--feed-action-bottom); display: flex; flex-direction: column; align-items: center; gap: 18px; z-index: 22; pointer-events: auto; }
        .action-btn { display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; -webkit-tap-highlight-color: transparent; background: transparent; border: 0; padding: 0; min-width: 48px; min-height: 48px; }
        .action-btn .icon-wrap { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: transparent; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6)); transition: transform 0.15s; }
        .action-btn:active .icon-wrap { transform: scale(0.85); }
        .action-btn .count { font-size: 12px; font-weight: 600; color: #fff; font-variant-numeric: tabular-nums; text-shadow: 0 1px 3px rgba(0,0,0,0.8); margin-top: 0; line-height: 1.2; min-height: 14px; }
        .creator-avatar { width: 48px; height: 48px; border-radius: 50%; border: 2px solid #fff; overflow: hidden; position: relative; margin-bottom: 14px; padding: 0; background: #1a1a1a; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .creator-avatar-fallback { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 20px; font-weight: 900; color: #fff; background: linear-gradient(135deg, #7C3AED 0%, #EC4899 100%); }
        .creator-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .avatar-plus { position: absolute; bottom: -14px; left: 50%; transform: translateX(-50%); width: 44px; height: 44px; min-width: 44px; min-height: 44px; border-radius: 50%; background: transparent; display: flex; align-items: center; justify-content: center; padding: 0; cursor: pointer; border: 0; color: transparent; transition: transform 0.15s; z-index: 2; }
        .avatar-plus::before { content: "+"; display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: #7C3AED; color: #fff; font-size: 16px; font-weight: 700; border: 2px solid #000; line-height: 1; }
        .avatar-plus:active { transform: translateX(-50%) scale(0.85); }
        .bottom-content { position: absolute; bottom: var(--feed-content-bottom); left: max(14px, calc(14px + env(safe-area-inset-left, 0px))); right: max(78px, calc(78px + env(safe-area-inset-right, 0px))); max-width: min(70vw, calc(100% - 92px)); z-index: 20; pointer-events: auto; }
        .creator-name { font-weight: 700; font-size: 15px; text-shadow: 0 1px 4px rgba(0,0,0,0.9); margin-bottom: 6px; }
        .video-desc { font-size: 14px; color: rgba(255,255,255,0.92); text-shadow: 0 1px 3px rgba(0,0,0,0.8); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 10px; line-height: 1.4; word-break: break-word; }
        .product-chip { display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.12); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); padding: 6px 12px 6px 6px; border-radius: 22px; cursor: pointer; transition: background 0.2s; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.15); color: #fff; max-width: 100%; min-height: 44px; }
        .product-chip:hover { background: rgba(255,255,255,0.2); }
        .product-chip img { width: 32px; height: 32px; border-radius: 14px; object-fit: cover; flex-shrink: 0; }
        .product-chip .chip-label { font-size: 13px; font-weight: 500; color: #fff; max-width: 30vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .product-chip .chip-price { font-weight: 700; font-size: 13px; color: #fff; background: rgba(0,0,0,0.35); padding: 3px 8px; border-radius: 10px; white-space: nowrap; }
        .product-chip .chip-score { font-weight: 800; font-size: 12px; color: #0D0D0D; background: #FDE047; padding: 3px 7px; border-radius: 999px; white-space: nowrap; }
        .product-chip .chip-buy { width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #7C3AED, #EC4899); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .music-ticker { display: flex; align-items: center; gap: 6px; font-size: 12px; color: rgba(255,255,255,0.85); min-height: 20px; }
        .music-ticker .marquee { display: inline-block; white-space: nowrap; max-width: min(60vw, 220px); overflow: hidden; }
        .music-ticker .marquee span { display: inline-block; animation: ticker 12s linear infinite; }
        .music-ticker .music-original { font-weight: 500; opacity: 0.9; max-width: min(60vw, 220px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .video-progress { position: absolute; bottom: calc(var(--feed-bottom-nav) + var(--feed-safe-bottom)); left: 0; right: 0; height: 2px; z-index: 21; background: rgba(255,255,255,0.18); overflow: hidden; }
        .video-progress-fill { height: 100%; background: linear-gradient(90deg, #7C3AED 0%, #EC4899 100%); width: 100%; transform: scaleX(0); transform-origin: left center; transition: transform 0.1s linear; will-change: transform; }
        .mute-btn { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 14px); right: max(14px, calc(14px + env(safe-area-inset-right, 0px))); width: 44px; height: 44px; border-radius: 50%; background: rgba(0,0,0,0.4); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 26; cursor: pointer; border: 1px solid rgba(255,255,255,0.18); transition: transform 0.15s; }
        .mute-btn:active { transform: scale(0.9); }
        .feed-header { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 14px); left: 0; right: 0; display: flex; justify-content: center; align-items: center; z-index: 26; gap: 24px; pointer-events: none; }
        .feed-tab { font-size: 16px; font-weight: 600; color: rgba(255,255,255,0.55); cursor: pointer; padding: 8px 4px; position: relative; transition: color 0.2s; background: transparent; border: 0; min-height: 44px; pointer-events: auto; }
        .feed-tab.active { color: #fff; }
        .feed-tab.active::after { content: ''; position: absolute; bottom: 4px; left: 30%; right: 30%; height: 2px; background: #fff; border-radius: 1px; }
        @keyframes heartPop { 0% { transform: scale(1); } 30% { transform: scale(1.3); } 60% { transform: scale(0.95); } 100% { transform: scale(1); } }
        .liked .icon-wrap { animation: heartPop 0.4s ease; }
        .disc-spin { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.25); overflow: hidden; position: relative; animation: discSpin 6s linear infinite; background: #1a1a1a; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6)); margin-top: 4px; }
        @keyframes discSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .disc-spin img { width: 100%; height: 100%; object-fit: cover; }
        .disc-spin::after { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 10px; height: 10px; border-radius: 50%; background: #000; border: 2px solid rgba(255,255,255,0.4); }
      `}} />

      <div className="feed-topbar">
        <form className="ai-search" onSubmit={(event) => { event.preventDefault(); submitAiPrompt(); }}>
          <Search size={16} color="rgba(255,255,255,0.78)" />
          <input
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            placeholder="Ce vrei să găsești azi?"
            aria-label="Caută cu AI în feed"
          />
          <Sparkles size={15} color="#FDE047" />
        </form>
        <div className="format-tabs" role="tablist" aria-label="Formate de shopping show">
          {FEED_FORMATS.map((format) => (
            <button
              key={format}
              type="button"
              className={`format-tab ${activeFormat === format ? "active" : ""}`}
              onClick={() => { setActiveFormat(format); trackFeedEvent("product_click", { metadata: { action: "format_tab", format } }); }}
              role="tab"
              aria-selected={activeFormat === format}
            >
              {format}
            </button>
          ))}
        </div>
      </div>

      <button className="mute-btn" onClick={toggleMute} aria-label={isMuted ? "Activează sunetul" : "Oprește sunetul"} aria-pressed={!isMuted}>
        {isMuted ? <VolumeX size={18} color="#fff" /> : <Volume2 size={18} color="#fff" />}
      </button>

      {shareToast && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.85)', color: '#fff', padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 500, zIndex: 100, backdropFilter: 'blur(8px)' }}>{shareToast}</div>
      )}

      <div ref={containerRef} className="feed-scroll">
        {loading ? (
          <div className="video-slide" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 48, height: 48, border: '3px solid rgba(255,255,255,0.15)', borderTopColor: '#ff2d55', borderRadius: '50%', animation: 'discSpin 0.8s linear infinite' }} />
          </div>
        ) : videos.length === 0 ? (
          <div className="video-slide" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,45,85,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <ShoppingCart size={36} color="#ff2d55" />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Nu există videoclipuri</h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>Fii primul care adaugă un clip!</p>
          </div>
        ) : (
          videos.map((video, idx) => {
            const isCurrent = idx === currentIndex;
            const nearActive = Math.abs(idx - currentIndex) <= MOUNT_RADIUS;
            return (
              <div
                key={video.id}
                data-video-id={video.id}
                data-video-idx={idx}
                className="video-slide"
              >
                {nearActive ? (
                  <FeedVideo
                    videoId={video.id}
                    src={video.url}
                    hlsUrl={video.hlsUrl}
                    fallbackSrc={video.fallbackUrl}
                    poster={video.thumbnail}
                    isCurrent={isCurrent}
                    muted={isMuted}
                    registerRef={registerVideoRef}
                    onTap={toggleMute}
                    onTimeUpdate={handleTimeUpdate}
                  />
                ) : (
                  video.thumbnail && (
                    <Image
                      className="poster-fallback"
                      src={video.thumbnail}
                      alt=""
                      fill
                      sizes="100vw"
                      loading="lazy"
                      unoptimized
                    />
                  )
                )}

                <div className="video-gradient-top" />
                <div className="video-gradient" />

                {nearActive && (
                  <div className="video-progress">
                    <div
                      className="video-progress-fill"
                      ref={(el) => {
                        if (el) progressBarRefs.current.set(video.id, el);
                        else progressBarRefs.current.delete(video.id);
                      }}
                    />
                  </div>
                )}

                {nearActive && video.product?.id && (
                  <section className="product-cockpit" aria-label="Product cockpit">
                    <div className="cockpit-meta">
                      <Link
                        href={`/u/${(video.creator as any)?.username || video.creator?.id || ''}`}
                        className="creator-link"
                      >
                        @{(video.creator as any)?.username || video.creator?.name || 'Swypik'}
                        {(video.creator as any)?.verified && <VerifiedBadge size={13} className="ml-1 align-middle" />}
                      </Link>
                      <span className="verdict-pill"><Sparkles size={12} />{getProductVerdict(video.product)}</span>
                    </div>

                    {coinBurst?.videoId === video.id && (
                      <div className="coin-burst" aria-hidden="true">
                        <span><Coins /></span>
                        <span>+8</span>
                        <span><Coins /></span>
                      </div>
                    )}

                    <button type="button" className="cockpit-main" onClick={() => { haptic("tap"); openProduct(video); }} aria-label="Deschide produsul">
                      <span className="cockpit-image">
                        {video.product.image ? (
                          <Image src={video.product.image} alt="" width={52} height={52} unoptimized />
                        ) : (
                          <ShoppingCart size={22} color="rgba(255,255,255,0.7)" />
                        )}
                      </span>
                      <span style={{ minWidth: 0, textAlign: 'left' }}>
                        <span className="cockpit-title">{video.product.name || 'Produs Swypik'}</span>
                        <span className="cockpit-sub">
                          <span className="cockpit-price">{video.product.priceDisplay || video.product.price || 'Vezi preț'}</span>
                          <span>{video.product.deliveryLabel || 'Livrare la checkout'}</span>
                        </span>
                      </span>
                      <span className="cockpit-score">
                        <span className="score-badge">{video.product.swypikScore ?? '—'}</span>
                        <span className="score-label">Score</span>
                      </span>
                    </button>

                    <div className="cockpit-actions">
                      <button
                        type="button"
                        className={`cockpit-btn ${video.product.votes?.viewerVote === 'worth_it' ? 'vote-on' : ''}`}
                        onClick={() => handleProductVote(video, 'worth_it')}
                        disabled={voteBusyKey === `${video.id}:worth_it`}
                        aria-pressed={video.product.votes?.viewerVote === 'worth_it'}
                      >
                        <ThumbsUp />Merită
                      </button>
                      <button
                        type="button"
                        className={`cockpit-btn ${video.product.votes?.viewerVote === 'not_worth_it' ? 'vote-on' : ''}`}
                        onClick={() => handleProductVote(video, 'not_worth_it')}
                        disabled={voteBusyKey === `${video.id}:not_worth_it`}
                        aria-pressed={video.product.votes?.viewerVote === 'not_worth_it'}
                      >
                        <ThumbsDown />Nu merită
                      </button>
                      <button
                        type="button"
                        className={`cockpit-btn ${savedVideos.has(video.id) ? 'vote-on' : ''}`}
                        onClick={() => handleSave(video.id)}
                        aria-pressed={savedVideos.has(video.id)}
                      >
                        <Bookmark />Salvează
                      </button>
                      <button
                        type="button"
                        className="cockpit-btn"
                        onClick={() => router.push(`/search?q=${encodeURIComponent(video.product.name || video.product.title || '')}`)}
                      >
                        <Scale />Alternative
                      </button>
                      <button
                        type="button"
                        className="cockpit-btn primary"
                        onClick={() => handleAddProductToCart(video)}
                        disabled={cartBusyProductId === String(video.product.id)}
                      >
                        <ShoppingCart />Coș
                      </button>
                    </div>

                    <div className="cockpit-actions cockpit-secondary">
                      <button type="button" className="cockpit-btn" onClick={() => { haptic("tap"); setActiveCommentsVideo(video); }}>
                        <MessageCircle />Discuții {formatCount(video.comments)}
                      </button>
                      <button type="button" className="cockpit-btn" onClick={() => handleShare(video.id)}>
                        Share {formatCount(video.shares)}
                      </button>
                      {video.creator?.id && !followingCreators.has(video.creator.id) ? (
                        <button type="button" className="cockpit-btn" onClick={() => handleFollow(video.creator?.id)}>
                          Urmărește
                        </button>
                      ) : (
                        <button type="button" className="cockpit-btn" onClick={() => openProduct(video)}>
                          Detalii
                        </button>
                      )}
                    </div>
                  </section>
                )}
              </div>
            );
          })
        )}
      </div>

      {activeProduct && (
        <ProductDrawer
          initialProduct={activeProduct}
          onClose={() => setActiveProduct(null)}
          onVoteChange={(nextProduct: any) => {
            if (!activeProduct?.videoId) return;
            const mergedProduct = { ...activeProduct, ...nextProduct };
            setActiveProduct(mergedProduct);
            updateVideo(activeProduct.videoId, { product: mergedProduct });
            trackEvent(activeProduct.videoId, "product_click", {
              product_id: activeProduct.id,
              action: "product_vote",
              vote: nextProduct?.votes?.viewerVote,
            });
          }}
          onBuyNow={() => {
            trackEvent(activeProduct.videoId, "buy_now", { product_id: activeProduct.id, surface: "product_drawer" });
            router.push(`/product/${activeProduct.id}`);
          }}
        />
      )}

      <CommentsSheet
        open={Boolean(activeCommentsVideo)}
        videoId={activeCommentsVideo?.id || null}
        initialCount={activeCommentsVideo?.comments}
        onClose={() => setActiveCommentsVideo(null)}
        onCountChange={(nextCount: number) => {
          if (!activeCommentsVideo?.id) return;
          updateVideo(activeCommentsVideo.id, { comments: String(nextCount) });
          setActiveCommentsVideo((current: any) => current ? { ...current, comments: String(nextCount) } : current);
        }}
      />
    </main>
  );
}

export default function ExploreClient({ initialVideos = [], initialCategory = "" }: { initialVideos?: any[]; initialCategory?: string }) {
  return (
    <Suspense fallback={<div style={{ background: '#000', height: '100dvh' }} />}>
      <ExplorePageInner initialVideos={initialVideos} initialCategory={initialCategory} />
    </Suspense>
  );
}
