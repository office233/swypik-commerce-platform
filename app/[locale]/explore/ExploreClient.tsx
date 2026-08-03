"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Bookmark, Heart, MessageCircle, Search, Share2, ShoppingCart, Sparkles, Volume2, VolumeX } from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import { useHlsVideo } from "@/lib/video/useHlsVideo";
import { haptic } from "@/lib/haptic";
import { trackEvent as trackFeedEvent, trackWatchTime, flushWatchTime, resetWatchTime, getSessionId } from "@/lib/feed/track";
import { useTranslations } from "next-intl";
import { routeForProduct } from "@/lib/products/product-route";

const ProductDrawer = dynamic(() => import("@/components/ProductDrawer"), { ssr: false });
const CommentsSheet = dynamic(() => import("@/components/social/CommentsSheet"), { ssr: false });

const MUTE_STORAGE_KEY = "swypik.feed.muted";
// Mount range: only render real <video src> for slides within Â±MOUNT_RADIUS of currentIndex
const MOUNT_RADIUS = 1;
const FEED_FORMATS = ["formatMerita", "formatSub50", "formatTestate", "formatSwypikFinds", "formatSelleriLocali", "formatBattles", "formatLiveDeals"] as const;

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
  const t = useTranslations("explore");
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialVideoId = searchParams.get("v");
    // Context de profil: player-ul navighează DOAR prin clipurile acestui creator.
    const creatorContextId = searchParams.get("creator_id");

  const [videos, setVideos] = useState<any[]>(initialVideos || []);
  const [loading, setLoading] = useState((initialVideos?.length || 0) === 0);
  const [feedSource, setFeedSource] = useState<"foryou" | "following">("foryou");
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeProduct, setActiveProduct] = useState<any | null>(null);
  const [activeCommentsVideo, setActiveCommentsVideo] = useState<any | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [activeFormat, setActiveFormat] = useState<typeof FEED_FORMATS[number]>(FEED_FORMATS[0]);
  const [aiPrompt, setAiPrompt] = useState("");
  const [cartBusyProductId, setCartBusyProductId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(MUTE_STORAGE_KEY);
      if (stored === "0") setIsMuted(false);
    } catch { }
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

  // Infinite scroll state
  const pageRef = useRef<number>(1);
  const hasMoreRef = useRef<boolean>(true);
  const loadingMoreRef = useRef<boolean>(false);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const registerVideoRef = useCallback((id: string, el: HTMLVideoElement | null) => {
    if (el) videoRefs.current.set(id, el);
    else videoRefs.current.delete(id);
  }, []);

  const handleTimeUpdate = useCallback((videoId: string, ratio: number, currentTime: number) => {
    // ref-based progress update â€” no setState, no re-render
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
    } catch { }
  }, []);

  const sendView = useCallback((videoId: string) => {
    if (viewedVideosRef.current.has(videoId)) return;
    viewedVideosRef.current.add(videoId);
    // legacy server counter
    fetch(`/api/videos/${videoId}/view`, { method: "POST" }).catch(() => { });
    // batched feed event
    try { trackFeedEvent("video_view" as any, { video_id: videoId }); } catch { }
  }, []);

  useEffect(() => {
    if (!sessionIdRef.current && typeof window !== "undefined") {
      // use shared feed session (also used by lib/feed/track)
      sessionIdRef.current = getSessionId();
    }

    // Reset pagination on feed/category change.
    pageRef.current = 1;
    hasMoreRef.current = true;
    loadingMoreRef.current = false;
    seenIdsRef.current = new Set();

    async function fetchVideos() {
      try {
        const catQs = initialCategory ? `&taxonomy_node_slug=${encodeURIComponent(initialCategory)}` : "";
        const sessionQs = sessionIdRef.current ? `&session_id=${encodeURIComponent(sessionIdRef.current)}` : "";
        const pinQs = initialVideoId ? `&v=${encodeURIComponent(initialVideoId)}` : "";
          const creatorQs = creatorContextId ? `&creator_id=${encodeURIComponent(creatorContextId)}` : "";
        const url = feedSource === "following"
            ? `/api/explore/feed?limit=30&page=1&source=following${catQs}${sessionQs}${pinQs}${creatorQs}`
            : `/api/explore/feed?limit=30&page=1${catQs}${sessionQs}${pinQs}${creatorQs}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const nextVideos = (data.videos || []) as any[];
          for (const v of nextVideos) seenIdsRef.current.add(v.id);
          hasMoreRef.current = Boolean(data.hasMore);
          pageRef.current = 1;
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
    // Seed-ul din RSC e deja filtrat pe creator_id și pinned pe ?v= (explore/page.tsx).
    if (initialVideos && initialVideos.length >= 20 && feedSource === 'foryou') {
      // skip initial fetch only when the server provided a full first batch
      const seeded = initialVideos;
      for (const v of seeded) seenIdsRef.current.add(v.id);
      pageRef.current = 1;
      hasMoreRef.current = true; // server seed always assumed to have more
      setLikedVideos(new Set(seeded.filter((v: any) => v.viewer?.liked).map((v: any) => v.id)));
      setSavedVideos(new Set(seeded.filter((v: any) => v.viewer?.saved).map((v: any) => v.id)));
      setFollowingCreators(new Set(seeded.filter((v: any) => v.viewer?.following).map((v: any) => v.creator?.id).filter(Boolean)));
      setLoading(false);
      return;
    }
    fetchVideos();
    }, [feedSource, initialCategory, initialVideos, creatorContextId, initialVideoId]);

  // Load next page of videos (infinite scroll).
  const loadMoreVideos = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    try {
      const nextPage = pageRef.current + 1;
      const catQs = initialCategory ? `&taxonomy_node_slug=${encodeURIComponent(initialCategory)}` : "";
      const sessionQs = sessionIdRef.current ? `&session_id=${encodeURIComponent(sessionIdRef.current)}` : "";
      const sourceQs = feedSource === "following" ? "&source=following" : "";
        const creatorQs = creatorContextId ? `&creator_id=${encodeURIComponent(creatorContextId)}` : "";
        const url = `/api/explore/feed?limit=30&page=${nextPage}${sourceQs}${catQs}${sessionQs}${creatorQs}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const incoming: any[] = data.videos || [];
      // Dedup against previously seen ids (server uses OFFSET so dups are rare,
      // but ranking jitter can return same video on adjacent pages).
      const fresh = incoming.filter((v) => v?.id && !seenIdsRef.current.has(v.id));
      for (const v of fresh) seenIdsRef.current.add(v.id);
      hasMoreRef.current = Boolean(data.hasMore);
      pageRef.current = nextPage;
      if (fresh.length > 0) {
        setVideos((current) => [...current, ...fresh]);
        setLikedVideos((current) => {
          const next = new Set(current);
          for (const v of fresh) if (v.viewer?.liked) next.add(v.id);
          return next;
        });
        setSavedVideos((current) => {
          const next = new Set(current);
          for (const v of fresh) if (v.viewer?.saved) next.add(v.id);
          return next;
        });
        setFollowingCreators((current) => {
          const next = new Set(current);
          for (const v of fresh) if (v.viewer?.following && v.creator?.id) next.add(v.creator.id);
          return next;
        });
      }
    } catch (err) {
      console.error("loadMoreVideos error:", err);
    } finally {
      loadingMoreRef.current = false;
    }
    }, [feedSource, initialCategory, creatorContextId]);

  // Trigger loadMore when user reaches the last ~3 videos.
  useEffect(() => {
    if (videos.length === 0) return;
    if (currentIndex >= videos.length - 3 && hasMoreRef.current) {
      loadMoreVideos();
    }
  }, [currentIndex, videos.length, loadMoreVideos]);

  // Intersection Observer â€” snap play/pause + currentIndex tracking
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
              videoEl.play().catch(() => { });
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

  // Deep-link `?v=<id>` â€” scroll to slide once after first load
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
      videoRefs.current.get(activeVideoId)?.play().catch(() => { });
    }
  }, [activeProduct, activeVideoId]);

  const toggleMute = useCallback(() => {
    haptic("tap");
    setIsMuted(prev => {
      const next = !prev;
      videoRefs.current.forEach((v) => { v.muted = next; });
      try { window.localStorage.setItem(MUTE_STORAGE_KEY, next ? "1" : "0"); } catch { }
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
        await navigator.share({ title: 'Swypik Video', url: shareUrl }).catch(() => { });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl).catch(() => { });
        setShareToast(t("linkCopiat"));
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
    } catch { }
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
      trackEvent(video.id, "add_to_cart", { product_id: product.id, surface: "feed_product_chip" });
      setShareToast(t("adaugatInCos"));
      window.dispatchEvent(new CustomEvent("reward", { detail: { points: 10, msg: t("cosPlus10Xp") } }));
    } catch {
      setShareToast(t("cosulNuSAActualizat"));
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
      <h1 className="sr-only">{t("descoperaVideoclipuriSwypik")}</h1>
      <style dangerouslySetInnerHTML={{
        __html: `
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
        @media (max-height: 640px) { .feed-topbar { gap: 6px; } .ai-search { height: 36px; border-radius: 16px; } .format-tab { min-height: 28px; padding: 0 10px; font-size: 11px; } }
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
            placeholder={t("ceVreiSaGasesti")}
            aria-label={t("cautaCuAiIn")}
          />
          <Sparkles size={15} color="#FDE047" />
        </form>
        <div className="format-tabs" role="tablist" aria-label={t("formateDeShoppingShow")}>
          {FEED_FORMATS.map((format) => (
            <button
              key={format}
              type="button"
              className={`format-tab ${activeFormat === format ? "active" : ""}`}
              onClick={() => { setActiveFormat(format); trackFeedEvent("product_click", { metadata: { action: "format_tab", format } }); }}
              role="tab"
              aria-selected={activeFormat === format}
            >
              {t(format)}
            </button>
          ))}
        </div>
      </div>

      <div className="feed-header" role="tablist" aria-label="Feed source">
        <button
          type="button"
          className={`feed-tab ${feedSource === "following" ? "active" : ""}`}
          role="tab"
          aria-selected={feedSource === "following"}
          onClick={() => setFeedSource("following")}
        >
          Following
        </button>
        <button
          type="button"
          className={`feed-tab ${feedSource === "foryou" ? "active" : ""}`}
          role="tab"
          aria-selected={feedSource === "foryou"}
          onClick={() => setFeedSource("foryou")}
        >
          For You
        </button>
      </div>

      <button className="mute-btn" onClick={toggleMute} aria-label={isMuted ? t("activeazaSunetul") : t("opresteSunetul")} aria-pressed={!isMuted}>
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
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{t("nuExistaVideoclipuri")}</h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>{t("fiiPrimulCareAdauga")}</p>
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

                {nearActive && (
                  <div className="bottom-content">
                    <Link
                      href={`/u/${(video.creator as any)?.username || video.creator?.id || ''}`}
                      className="creator-name"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#fff', textDecoration: 'none' }}
                    >
                      @{(video.creator as any)?.username || video.creator?.name || 'swypik'}
                      {(video.creator as any)?.verified && <VerifiedBadge size={14} />}
                    </Link>
                    {(video.description || video.title) && (
                      <p className="video-desc">{video.description || video.title}</p>
                    )}
                    {video.product?.id && (
                      <button type="button" className="product-chip" onClick={() => { haptic("tap"); openProduct(video); }}>
                        {video.product.image ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={video.product.image} alt="" />
                        ) : null}
                        <span className="chip-label">{video.product.name || video.product.title || 'Produs'}</span>
                        <span className="chip-price">{video.product.priceDisplay || video.product.price || t("veziPret")}</span>
                        <span className="chip-buy" onClick={(e) => { e.stopPropagation(); handleAddProductToCart(video); }} role="button" aria-label={t("cos")}>
                          <ShoppingCart size={14} color="#fff" />
                        </span>
                      </button>
                    )}
                  </div>
                )}

                {nearActive && (
                  <div className="action-bar" aria-label={t("actiuniVideo")}>
                    {video.creator?.id && (
                      <button type="button" className="creator-avatar" onClick={() => router.push(`/u/${(video.creator as any)?.username || video.creator?.id}`)} aria-label={`@${(video.creator as any)?.username || video.creator?.name || 'creator'}`}>
                        {(video.creator as any)?.avatar ? (
                          <img src={(video.creator as any).avatar} alt="" />
                        ) : (
                          <span className="creator-avatar-fallback">{((video.creator as any)?.username || video.creator?.name || 'S').charAt(0).toUpperCase()}</span>
                        )}
                        {!followingCreators.has(video.creator.id) && (
                          <span className="avatar-plus" role="button" aria-label={t("urmareste")} onClick={(e) => { e.stopPropagation(); handleFollow(video.creator?.id); }} />
                        )}
                      </button>
                    )}
                    <button type="button" className={`action-btn ${likedVideos.has(video.id) ? 'liked' : ''}`} onClick={() => handleLike(video.id)} aria-pressed={likedVideos.has(video.id)} aria-label={t("apreciaza")}>
                      <span className="icon-wrap"><Heart size={30} fill={likedVideos.has(video.id) ? '#ff2d55' : 'transparent'} color={likedVideos.has(video.id) ? '#ff2d55' : '#fff'} /></span>
                      <span className="count">{formatCount(video.likes)}</span>
                    </button>
                    <button type="button" className="action-btn" onClick={() => { haptic("tap"); setActiveCommentsVideo(video); }} aria-label={t("discutii")}>
                      <span className="icon-wrap"><MessageCircle size={29} color="#fff" /></span>
                      <span className="count">{formatCount(video.comments)}</span>
                    </button>
                    <button type="button" className={`action-btn ${savedVideos.has(video.id) ? 'liked' : ''}`} onClick={() => handleSave(video.id)} aria-pressed={savedVideos.has(video.id)} aria-label={t("salveaza")}>
                      <span className="icon-wrap"><Bookmark size={28} fill={savedVideos.has(video.id) ? '#FDE047' : 'transparent'} color={savedVideos.has(video.id) ? '#FDE047' : '#fff'} /></span>
                      <span className="count">{formatCount(video.saves)}</span>
                    </button>
                    <button type="button" className="action-btn" onClick={() => handleShare(video.id)} aria-label={t("distribuie")}>
                      <span className="icon-wrap"><Share2 size={28} color="#fff" /></span>
                      <span className="count">{formatCount(video.shares)}</span>
                    </button>
                  </div>
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
            router.push(routeForProduct(activeProduct));
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
  const t = useTranslations("explore");
  return (
    <Suspense fallback={<div style={{ background: '#000', height: '100dvh' }} />}>
      <ExplorePageInner initialVideos={initialVideos} initialCategory={initialCategory} />
    </Suspense>
  );
}
