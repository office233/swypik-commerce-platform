"use client";

import { useEffect, useState, useRef, useCallback, Fragment, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Heart, Share2, ShoppingCart, MessageCircle, Bookmark, Volume2, VolumeX, Music2, ShoppingBag } from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import { useHlsVideo } from "@/lib/video/useHlsVideo";
import { haptic } from "@/lib/haptic";

const ProductDrawer = dynamic(() => import("@/components/ProductDrawer"), { ssr: false });
const CommentsSheet = dynamic(() => import("@/components/social/CommentsSheet"), { ssr: false });
const MoreLikeThisMenu = dynamic(() => import("@/components/feed/MoreLikeThisMenu"), { ssr: false });

const MUTE_STORAGE_KEY = "swypik.feed.muted";
// Mount range: only render real <video src> for slides within ±MOUNT_RADIUS of currentIndex
const MOUNT_RADIUS = 1;

export function renderDescription(text: string | null | undefined) {
  if (!text) return null;
  const parts = text.split(/(#[\p{L}0-9_]+|@[a-zA-Z0-9_.]+)/gu);
  return parts.map((part, i) => {
    if (part.startsWith("#") && part.length > 1) {
      const tag = part.slice(1).toLowerCase();
      return (
        <Link key={i} href={`/hashtag/${tag}`} className="text-white font-semibold hover:underline">
          {part}
        </Link>
      );
    }
    if (part.startsWith("@") && part.length > 1) {
      const username = part.slice(1);
      return (
        <Link key={i} href={`/u/${username}`} className="text-white font-semibold hover:underline">
          {part}
        </Link>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

interface FeedVideoProps {
  videoId: string;
  src: string | null | undefined;
  hlsUrl: string | null | undefined;
  poster: string | null | undefined;
  active: boolean;
  muted: boolean;
  registerRef: (id: string, el: HTMLVideoElement | null) => void;
  onTap: () => void;
  onTimeUpdate: (videoId: string, ratio: number) => void;
}

function FeedVideo({ videoId, src, hlsUrl, poster, active, muted, registerRef, onTap, onTimeUpdate }: FeedVideoProps) {
  // useHlsVideo wires src only when active. Returns ref to attach.
  const effectiveSrc = active ? (hlsUrl || src || undefined) : undefined;
  const hlsRef = useHlsVideo(effectiveSrc);

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
      preload={active ? "auto" : "none"}
      onClick={onTap}
      onTimeUpdate={(e) => {
        const v = e.currentTarget;
        if (v.duration) onTimeUpdate(videoId, v.currentTime / v.duration);
      }}
    />
  );
}

function ExplorePageInner({ initialVideos }: { initialVideos: any[] }) {
  const searchParams = useSearchParams();
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

  const viewedVideosRef = useRef<Set<string>>(new Set());
  const sessionIdRef = useRef<string>("");
  const deepLinkHandledRef = useRef(false);

  const registerVideoRef = useCallback((id: string, el: HTMLVideoElement | null) => {
    if (el) videoRefs.current.set(id, el);
    else videoRefs.current.delete(id);
  }, []);

  const handleTimeUpdate = useCallback((videoId: string, ratio: number) => {
    // ref-based progress update — no setState, no re-render
    const bar = progressBarRefs.current.get(videoId);
    if (bar) bar.style.transform = `scaleX(${Math.min(1, Math.max(0, ratio))})`;
  }, []);

  const trackEvent = useCallback((videoId: string, eventType: string, data?: any) => {
    if (!sessionIdRef.current) return;
    fetch(`/api/videos/${videoId}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_type: eventType, session_id: sessionIdRef.current, ...data }),
    }).catch(() => {});
  }, []);

  const sendView = useCallback((videoId: string) => {
    if (viewedVideosRef.current.has(videoId)) return;
    viewedVideosRef.current.add(videoId);
    fetch(`/api/videos/${videoId}/view`, { method: "POST" }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!sessionIdRef.current && typeof window !== "undefined") {
      sessionIdRef.current = window.crypto?.randomUUID?.()
        || `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    async function fetchVideos() {
      try {
        const url = feedSource === "following"
          ? "/api/explore/feed?limit=30&source=following"
          : "/api/explore/feed?limit=30";
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
    if (initialVideos && initialVideos.length > 0 && feedSource === 'foryou') {
      // skip initial fetch — server provided seed
      const seeded = initialVideos;
      setLikedVideos(new Set(seeded.filter((v: any) => v.viewer?.liked).map((v: any) => v.id)));
      setSavedVideos(new Set(seeded.filter((v: any) => v.viewer?.saved).map((v: any) => v.id)));
      setFollowingCreators(new Set(seeded.filter((v: any) => v.viewer?.following).map((v: any) => v.creator?.id).filter(Boolean)));
      setLoading(false);
      return;
    }
    fetchVideos();
  }, [feedSource]);

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
    // Open instantly with the data we already have from the feed.
    // ProductDrawer enriches in background if description is missing.
    setActiveProduct({ ...video.product, videoId: video.id });
  }, []);

  const formatCount = (n: string | number) => {
    const num = typeof n === 'string' ? parseInt(n) : n;
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return String(num || 0);
  };

  return (
    <div className="explore-root">
      <style dangerouslySetInnerHTML={{__html: `
        .explore-root { position: fixed; inset: env(safe-area-inset-top, 0px) 0 0 0; background: #000; color: #fff; overflow: hidden; min-height: 100dvh; }
        .explore-root * { box-sizing: border-box; }
        .feed-scroll { height: 100%; width: 100%; overflow-y: scroll; scroll-snap-type: y mandatory; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
        .feed-scroll::-webkit-scrollbar { display: none; }
        .video-slide { height: 100dvh; width: 100%; min-height: 100%; scroll-snap-align: center; position: relative; display: flex; align-items: center; justify-content: center; background: #000; }
        .video-slide video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        .video-slide .poster-fallback { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        .video-gradient { position: absolute; bottom: 0; left: 0; right: 0; height: 55%; pointer-events: none; background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 40%, transparent 100%); }
        .video-gradient-top { position: absolute; top: 0; left: 0; right: 0; height: 120px; pointer-events: none; background: linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%); }
        .action-bar { position: absolute; right: max(8px, calc(8px + env(safe-area-inset-right, 0px))); bottom: max(170px, calc(170px + env(safe-area-inset-bottom, 0px))); display: flex; flex-direction: column; align-items: center; gap: 14px; z-index: 20; }
        .action-btn { display: flex; flex-direction: column; align-items: center; gap: 2px; cursor: pointer; -webkit-tap-highlight-color: transparent; background: transparent; border: 0; padding: 0; min-width: 48px; }
        .action-btn .icon-wrap { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: transparent; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6)); transition: transform 0.15s; }
        .action-btn:active .icon-wrap { transform: scale(0.85); }
        .action-btn .count { font-size: 13px; font-weight: 600; color: #fff; font-variant-numeric: tabular-nums; text-shadow: 0 1px 3px rgba(0,0,0,0.8); margin-top: 0; line-height: 1.2; }
        .creator-avatar { width: 48px; height: 48px; border-radius: 50%; border: 2px solid #fff; overflow: hidden; position: relative; margin-bottom: 18px; padding: 0; background: #1a1a1a; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .creator-avatar-fallback { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 20px; font-weight: 900; color: #fff; background: linear-gradient(135deg, #7C3AED 0%, #EC4899 100%); }
        .creator-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .avatar-plus { position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 22px; height: 22px; border-radius: 50%; background: #7C3AED; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; border: 2px solid #000; color: #fff; padding: 0; cursor: pointer; transition: transform 0.15s; }
        .avatar-plus:active { transform: translateX(-50%) scale(0.85); }
        .bottom-content { position: absolute; bottom: max(80px, calc(80px + env(safe-area-inset-bottom, 0px))); left: max(14px, calc(14px + env(safe-area-inset-left, 0px))); right: max(80px, calc(80px + env(safe-area-inset-right, 0px))); max-width: calc(100% - 72px); z-index: 20; }
        .creator-name { font-weight: 700; font-size: 16px; text-shadow: 0 1px 4px rgba(0,0,0,0.9); margin-bottom: 6px; }
        .video-desc { font-size: 14px; color: rgba(255,255,255,0.9); text-shadow: 0 1px 3px rgba(0,0,0,0.8); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 10px; line-height: 1.4; }
        .product-chip { display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.12); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); padding: 6px 12px 6px 6px; border-radius: 22px; border: 1px solid rgba(255,255,255,0.15); cursor: pointer; transition: background 0.2s; margin-bottom: 8px; border: 0; color: #fff; }
        .product-chip:hover { background: rgba(255,255,255,0.2); }
        .product-chip img { width: 36px; height: 36px; border-radius: 16px; object-fit: cover; flex-shrink: 0; }
        .product-chip .chip-price { font-weight: 700; font-size: 14px; color: #0D0D0D; }
        .product-chip .chip-buy { width: 28px; height: 28px; border-radius: 50%; background: #0D0D0D; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .music-ticker { display: flex; align-items: center; gap: 6px; font-size: 13px; color: rgba(255,255,255,0.8); }
        .music-ticker .marquee { display: inline-block; white-space: nowrap; max-width: 200px; overflow: hidden; }
        .music-ticker .marquee span { display: inline-block; animation: ticker 8s linear infinite; }
        .music-ticker .music-original { font-weight: 500; opacity: 0.9; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .video-progress { position: absolute; bottom: 0; left: 0; right: 0; height: 3px; z-index: 30; background: rgba(255,255,255,0.2); overflow: hidden; }
        .video-progress-fill { height: 100%; background: #fff; width: 100%; transform: scaleX(0); transform-origin: left center; transition: transform 0.1s linear; will-change: transform; }
        .mute-btn { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 16px); right: 14px; width: 36px; height: 36px; border-radius: 50%; background: rgba(0,0,0,0.35); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 25; cursor: pointer; border: 1px solid rgba(255,255,255,0.15); transition: transform 0.15s; }
        .mute-btn:active { transform: scale(0.9); }
        .feed-header { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 14px); left: 0; right: 0; display: flex; justify-content: center; align-items: center; z-index: 25; gap: 20px; }
        .feed-tab { font-size: 16px; font-weight: 600; color: rgba(255,255,255,0.55); cursor: pointer; padding: 4px 0; position: relative; transition: color 0.2s; background: transparent; border: 0; }
        .feed-tab.active { color: #fff; }
        .feed-tab.active::after { content: ''; position: absolute; bottom: -2px; left: 30%; right: 30%; height: 2px; background: #fff; border-radius: 1px; }
        @keyframes heartPop { 0% { transform: scale(1); } 30% { transform: scale(1.3); } 60% { transform: scale(0.95); } 100% { transform: scale(1); } }
        .liked .icon-wrap { animation: heartPop 0.4s ease; }
        .disc-spin { display: block; width: 40px; height: 40px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.25); overflow: hidden; position: relative; animation: discSpin 6s linear infinite; background: #1a1a1a; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6)); margin-top: 6px; }
        @keyframes discSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .disc-spin img { width: 100%; height: 100%; object-fit: cover; }
        .disc-spin::after { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 10px; height: 10px; border-radius: 50%; background: #000; border: 2px solid rgba(255,255,255,0.4); }
      `}} />

      <div className="feed-header">
        <button type="button" onClick={() => setFeedSource("following")} className={`feed-tab ${feedSource === "following" ? "active" : ""}`}>Urmărești</button>
        <button type="button" onClick={() => setFeedSource("foryou")} className={`feed-tab ${feedSource === "foryou" ? "active" : ""}`}>Pentru Tine</button>
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
            const active = Math.abs(idx - currentIndex) <= MOUNT_RADIUS;
            return (
              <div
                key={video.id}
                data-video-id={video.id}
                data-video-idx={idx}
                className="video-slide"
              >
                {active ? (
                  <FeedVideo
                    videoId={video.id}
                    src={video.url}
                    hlsUrl={video.hlsUrl}
                    poster={video.thumbnail}
                    active={active}
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

                <div className="video-progress">
                  <div
                    className="video-progress-fill"
                    ref={(el) => {
                      if (el) progressBarRefs.current.set(video.id, el);
                      else progressBarRefs.current.delete(video.id);
                    }}
                  />
                </div>

                <div className="action-bar">
                  <div style={{ position: 'relative', marginBottom: 8 }}>
                    <Link
                      href={`/u/${(video.creator as any)?.username || video.creator?.id || ''}`}
                      className="creator-avatar"
                      aria-label={`Profil ${(video.creator as any)?.username || 'creator'}`}
                    >
                      {video.creator?.avatar ? (
                        <Image src={video.creator.avatar} alt="" width={48} height={48} unoptimized />
                      ) : (
                        <span className="creator-avatar-fallback">
                          {((video.creator as any)?.username || video.creator?.name || 'S').charAt(0).toUpperCase()}
                        </span>
                      )}
                    </Link>
                    {video.creator?.id && !followingCreators.has(video.creator.id) && (
                      <button
                        type="button"
                        className="avatar-plus"
                        onClick={(e) => { e.preventDefault(); handleFollow(video.creator?.id); }}
                        aria-label="Urmărește creatorul"
                      >+</button>
                    )}
                  </div>

                  <button
                    type="button"
                    className={`action-btn ${likedVideos.has(video.id) ? 'liked' : ''}`}
                    onClick={() => handleLike(video.id)}
                    aria-label={likedVideos.has(video.id) ? "Anulează aprecierea" : "Apreciază"}
                    aria-pressed={likedVideos.has(video.id)}
                  >
                    <div className="icon-wrap">
                      <Heart size={32} strokeWidth={1.5} color={likedVideos.has(video.id) ? "#EF4444" : "#fff"} fill={likedVideos.has(video.id) ? "#EF4444" : "none"} />
                    </div>
                    <span className="count">{formatCount(video.likes)}</span>
                  </button>

                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => { haptic("tap"); setActiveCommentsVideo(video); }}
                    aria-label="Vezi comentariile"
                  >
                    <div className="icon-wrap">
                      <MessageCircle size={32} strokeWidth={1.5} color="#fff" />
                    </div>
                    <span className="count">{formatCount(video.comments)}</span>
                  </button>

                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => handleSave(video.id)}
                    aria-label={savedVideos.has(video.id) ? "Elimină din salvate" : "Salvează videoul"}
                    aria-pressed={savedVideos.has(video.id)}
                  >
                    <div className="icon-wrap">
                      <Bookmark size={32} strokeWidth={1.5} color={savedVideos.has(video.id) ? "#fbbf24" : "#fff"} fill={savedVideos.has(video.id) ? "#fbbf24" : "none"} />
                    </div>
                    <span className="count">{formatCount(video.saves)}</span>
                  </button>

                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => handleShare(video.id)}
                    aria-label="Distribuie videoul"
                  >
                    <div className="icon-wrap">
                      <Share2 size={32} strokeWidth={1.5} color="#fff" />
                    </div>
                    <span className="count">{formatCount(video.shares)}</span>
                  </button>

                  <div className="action-btn" aria-label="Mai multe opțiuni">
                    <MoreLikeThisMenu
                      videoId={video.id}
                      creatorId={video.creator?.id}
                      isFollowing={followingCreators.has(video.creator?.id)}
                      onActionDone={(action: string) => {
                        if (action === "not_interested") {
                          setVideos((prev) => prev.filter((v) => v.id !== video.id));
                        }
                      }}
                    />
                  </div>

                  {video.audioTrack?.image && (
                    <Link
                      href={video.audioTrack.id ? `/audio/${video.audioTrack.id}` : '#'}
                      className="disc-spin"
                      aria-label={video.audioTrack.title || 'Audio'}
                    >
                      <Image src={video.audioTrack.image} alt="" width={40} height={40} unoptimized />
                    </Link>
                  )}
                </div>

                <div className="bottom-content">
                  <Link
                    href={`/u/${(video.creator as any)?.username || video.creator?.id || ''}`}
                    className="creator-name"
                    style={{ display: 'inline-block', color: '#fff', textDecoration: 'none' }}
                  >
                    @{(video.creator as any)?.username || video.creator?.name || 'Swypik'}
                    {(video.creator as any)?.verified && <VerifiedBadge size={14} className="ml-1 align-middle" />}
                  </Link>

                  <p className="video-desc">{renderDescription(video.description)}</p>

                  {video.product?.id && (
                    <button type="button" className="product-chip" onClick={() => { haptic("tap"); openProduct(video); }} aria-label="Cumpără produsul prezentat">
                      {video.product.image && (
                        <Image src={video.product.image} alt="" width={36} height={36} unoptimized style={{ borderRadius: 16, objectFit: 'cover', flexShrink: 0 }} />
                      )}
                      <span style={{ fontSize: 13, fontWeight: 500, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fff' }}>
                        {video.product.name || 'Vezi produs'}
                      </span>
                      <span className="chip-price">{video.product.price || 'Vezi'}</span>
                      <div className="chip-buy">
                        <ShoppingCart size={14} color="#fff" />
                      </div>
                    </button>
                  )}

                  <div className="music-ticker">
                    <Music2 size={14} />
                    {video.audioTrack?.title ? (
                      <div className="marquee">
                        {video.audioTrack.id ? (
                          <Link href={`/audio/${video.audioTrack.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                            <span>
                              {video.audioTrack.title}{video.audioTrack.artist ? ` – ${video.audioTrack.artist}` : ''} &nbsp;&nbsp;&nbsp;
                              {video.audioTrack.title}{video.audioTrack.artist ? ` – ${video.audioTrack.artist}` : ''} &nbsp;&nbsp;&nbsp;
                            </span>
                          </Link>
                        ) : (
                          <span>
                            {video.audioTrack.title}{video.audioTrack.artist ? ` – ${video.audioTrack.artist}` : ''} &nbsp;&nbsp;&nbsp;
                            {video.audioTrack.title}{video.audioTrack.artist ? ` – ${video.audioTrack.artist}` : ''} &nbsp;&nbsp;&nbsp;
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="music-original">
                        Original – @{(video.creator as any)?.username || video.creator?.name || 'swypik'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {activeProduct && (
        <ProductDrawer
          initialProduct={activeProduct}
          onClose={() => setActiveProduct(null)}
          onBuyNow={() => {
            trackEvent(activeProduct.videoId, "buy_now");
            window.location.href = `/product/${activeProduct.id}`;
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
    </div>
  );
}

export default function ExploreClient({ initialVideos = [] }: { initialVideos?: any[] }) {
  return (
    <Suspense fallback={<div style={{ background: '#000', height: '100dvh' }} />}>
      <ExplorePageInner initialVideos={initialVideos} />
    </Suspense>
  );
}
