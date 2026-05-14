/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Heart, Share2, ShoppingCart, MessageCircle, Bookmark, Volume2, VolumeX, Music } from "lucide-react";
import ProductDrawer from "@/components/ProductDrawer";
import CommentsSheet from "@/components/social/CommentsSheet";
import MoreLikeThisMenu from "@/components/feed/MoreLikeThisMenu";

export default function ExplorePage() {
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedSource, setFeedSource] = useState<"foryou" | "following">("foryou");
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [activeProduct, setActiveProduct] = useState<any | null>(null);
  const [activeCommentsVideo, setActiveCommentsVideo] = useState<any | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [likedVideos, setLikedVideos] = useState<Set<string>>(new Set());
  const [savedVideos, setSavedVideos] = useState<Set<string>>(new Set());
  const [followingCreators, setFollowingCreators] = useState<Set<string>>(new Set());
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  // Tracking
  const viewedVideosRef = useRef<Set<string>>(new Set());
  const sessionIdRef = useRef<string>("");

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

  // Fetch videos
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
    fetchVideos();
  }, [feedSource]);

  // Intersection Observer — TikTok-style snap play/pause
  useEffect(() => {
    if (videos.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const videoId = entry.target.getAttribute("data-video-id");
          const videoEl = videoRefs.current.get(videoId || "");
          if (!videoEl || !videoId) return;

          if (entry.isIntersecting) {
            setActiveVideoId(videoId);
            videoEl.currentTime = 0;
            videoEl.play().catch(() => {});
            
            // View tracking after 3s
            setTimeout(() => sendView(videoId), 3000);
            trackEvent(videoId, "impression");
          } else {
            videoEl.pause();
          }
        });
      },
      { root: containerRef.current, threshold: 0.7 }
    );

    const containers = containerRef.current?.querySelectorAll("[data-video-id]");
    containers?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [videos, sendView, trackEvent]);

  // Pause videos when product drawer opens
  useEffect(() => {
    if (activeProduct) {
      videoRefs.current.forEach((v) => v.pause());
    } else if (activeVideoId) {
      videoRefs.current.get(activeVideoId)?.play().catch(() => {});
    }
  }, [activeProduct, activeVideoId]);

  // Toggle mute on ALL videos
  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      videoRefs.current.forEach((v) => { v.muted = next; });
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

  // Like
  const handleLike = useCallback(async (videoId: string) => {
    const wasLiked = likedVideos.has(videoId);
    const nextLiked = !wasLiked;
    const video = videos.find((item) => item.id === videoId);
    const previousCount = countValue(video?.likes);

    setLikedVideos(prev => {
      const next = new Set(prev);
      if (nextLiked) next.add(videoId);
      else next.delete(videoId);
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
        if (data.liked) next.add(videoId);
        else next.delete(videoId);
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
        if (wasLiked) next.add(videoId);
        else next.delete(videoId);
        return next;
      });
      updateVideo(videoId, { likes: String(previousCount), viewer: { liked: wasLiked } });
    }
  }, [likedVideos, trackEvent, updateVideo, videos]);

  // Save
  const handleSave = useCallback(async (videoId: string) => {
    const wasSaved = savedVideos.has(videoId);
    const nextSaved = !wasSaved;
    const video = videos.find((item) => item.id === videoId);
    const previousCount = countValue(video?.saves);

    setSavedVideos(prev => {
      const next = new Set(prev);
      if (nextSaved) next.add(videoId);
      else next.delete(videoId);
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
        if (data.saved) next.add(videoId);
        else next.delete(videoId);
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
        if (wasSaved) next.add(videoId);
        else next.delete(videoId);
        return next;
      });
      updateVideo(videoId, { saves: String(previousCount), viewer: { saved: wasSaved } });
    }
  }, [savedVideos, trackEvent, updateVideo, videos]);

  // Share
  const handleShare = useCallback(async (videoId: string) => {
    const video = videos.find((item) => item.id === videoId);
    const previousCount = countValue(video?.shares);
    const shareUrl = `${window.location.origin}/explore?v=${videoId}`;
    let channel = "copy_link";

    try {
      if (navigator.share) {
        channel = "native_share";
        await navigator.share({
          title: 'Swypik Video',
          url: shareUrl
        }).catch(() => {});
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl).catch(() => {});
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
    const wasFollowing = followingCreators.has(creatorId);
    const nextFollowing = !wasFollowing;

    setFollowingCreators(prev => {
      const next = new Set(prev);
      if (nextFollowing) next.add(creatorId);
      else next.delete(creatorId);
      return next;
    });

    try {
      const res = await fetch(`/api/users/${creatorId}/follow`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Follow failed");

      setFollowingCreators(prev => {
        const next = new Set(prev);
        if (data.following) next.add(creatorId);
        else next.delete(creatorId);
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
        if (wasFollowing) next.add(creatorId);
        else next.delete(creatorId);
        return next;
      });
    }
  }, [followingCreators]);

  // Open product from video
  const openProduct = useCallback(async (video: any) => {
    if (video.product?.id) {
      try {
        const res = await fetch(`/api/products/${video.product.id}`);
        if (res.ok) {
          const data = await res.json();
          setActiveProduct({ ...data.product, videoId: video.id });
          return;
        }
      } catch {}
    }
    // No product linked — could navigate to shop
    setActiveProduct(null);
  }, []);

  // Format numbers like TikTok
  const formatCount = (n: string | number) => {
    const num = typeof n === 'string' ? parseInt(n) : n;
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return String(num || 0);
  };

  return (
    <div className="explore-root">
      <style dangerouslySetInnerHTML={{__html: `
        .explore-root {
          position: fixed;
          inset: env(safe-area-inset-top, 0px) 0 0 0;
          background: #000; color: #fff;
          overflow: hidden;
          min-height: 100dvh;
        }
        .explore-root * { box-sizing: border-box; }
        .feed-scroll {
          height: 100%; width: 100%;
          overflow-y: scroll; scroll-snap-type: y mandatory;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .feed-scroll::-webkit-scrollbar { display: none; }
        .video-slide {
          height: 100dvh; width: 100%;
          min-height: 100%;
          scroll-snap-align: center;
          position: relative;
          display: flex; align-items: center; justify-content: center;
        }
        .video-slide video {
          position: absolute; inset: 0;
          width: 100%; height: 100%;
          object-fit: cover;
        }
        /* Bottom gradient */
        .video-gradient {
          position: absolute; bottom: 0; left: 0; right: 0;
          height: 55%; pointer-events: none;
          background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 40%, transparent 100%);
        }
        /* Top gradient for header */
        .video-gradient-top {
          position: absolute; top: 0; left: 0; right: 0;
          height: 120px; pointer-events: none;
          background: linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%);
        }
        /* Right action bar */
        .action-bar {
          position: absolute;
          right: max(12px, calc(12px + env(safe-area-inset-right, 0px)));
          bottom: max(120px, calc(120px + env(safe-area-inset-bottom, 0px)));
          display: flex; flex-direction: column; align-items: center; gap: 20px;
          z-index: 20;
        }
        .action-btn {
          display: flex; flex-direction: column; align-items: center; gap: 4px;
          cursor: pointer; -webkit-tap-highlight-color: transparent;
        }
        .action-btn .icon-wrap {
          width: 48px; height: 48px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 50%;
          transition: transform 0.15s, background 0.2s;
        }
        .action-btn:active .icon-wrap { transform: scale(0.85); }
        .action-btn .count {
          font-size: 11px; font-weight: 600;
          text-shadow: 0 1px 3px rgba(0,0,0,0.8);
        }
        /* Creator avatar */
        .creator-avatar {
          width: 48px; height: 48px; border-radius: 50%;
          border: 2px solid #fff; overflow: hidden;
          position: relative; margin-bottom: 16px;
          padding: 0; background: transparent; cursor: pointer;
        }
        .creator-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .avatar-plus {
          position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%);
          width: 20px; height: 20px; border-radius: 50%;
          background: #ff2d55; display: flex; align-items: center; justify-content: center;
          font-size: 14px; font-weight: 700; border: 2px solid #000;
          color: #fff;
        }
        /* Bottom content */
        .bottom-content {
          position: absolute;
          bottom: max(16px, calc(16px + env(safe-area-inset-bottom, 0px)));
          left: max(14px, calc(14px + env(safe-area-inset-left, 0px)));
          right: max(80px, calc(80px + env(safe-area-inset-right, 0px)));
          z-index: 20;
        }
        .creator-name {
          font-weight: 700; font-size: 16px;
          text-shadow: 0 1px 4px rgba(0,0,0,0.9);
          margin-bottom: 6px;
        }
        .video-desc {
          font-size: 14px; color: rgba(255,255,255,0.9);
          text-shadow: 0 1px 3px rgba(0,0,0,0.8);
          display: -webkit-box; -webkit-line-clamp: 2;
          -webkit-box-orient: vertical; overflow: hidden;
          margin-bottom: 10px; line-height: 1.4;
        }
        /* Product chip */
        .product-chip {
          display: inline-flex; align-items: center; gap: 8px;
          background: rgba(255,255,255,0.12);
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          padding: 6px 12px 6px 6px;
          border-radius: 22px; border: 1px solid rgba(255,255,255,0.15);
          cursor: pointer; transition: background 0.2s;
          margin-bottom: 8px;
        }
        .product-chip:hover { background: rgba(255,255,255,0.2); }
        .product-chip img {
          width: 36px; height: 36px; border-radius: 16px;
          object-fit: cover; flex-shrink: 0;
        }
        .product-chip .chip-price {
          font-weight: 700; font-size: 14px; color: #0D0D0D;
        }
        .product-chip .chip-buy {
          width: 28px; height: 28px; border-radius: 50%;
          background: #0D0D0D; display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        /* Music marquee */
        .music-ticker {
          display: flex; align-items: center; gap: 6px;
          font-size: 13px; color: rgba(255,255,255,0.8);
        }
        .music-ticker .marquee {
          display: inline-block; white-space: nowrap;
          max-width: 200px; overflow: hidden;
        }
        .music-ticker .marquee span {
          display: inline-block;
          animation: ticker 8s linear infinite;
        }
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        /* Progress bar */
        .video-progress {
          position: absolute; bottom: 0; left: 0; right: 0;
          height: 3px; z-index: 30;
          background: rgba(255,255,255,0.2);
        }
        .video-progress-fill {
          height: 100%; background: #fff;
          transition: width 0.3s linear;
        }
        /* Mute button top-right */
        .mute-btn {
          position: absolute; top: calc(env(safe-area-inset-top, 0px) + 16px); right: 14px;
          width: 36px; height: 36px; border-radius: 50%;
          background: rgba(0,0,0,0.35); backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center;
          z-index: 25; cursor: pointer; border: 1px solid rgba(255,255,255,0.15);
          transition: transform 0.15s;
        }
        .mute-btn:active { transform: scale(0.9); }
        /* Top header */
        .feed-header {
          position: absolute; top: calc(env(safe-area-inset-top, 0px) + 14px);
          left: 0; right: 0;
          display: flex; justify-content: center; align-items: center;
          z-index: 25; gap: 20px;
        }
        .feed-tab {
          font-size: 16px; font-weight: 600;
          color: rgba(255,255,255,0.55); cursor: pointer;
          padding: 4px 0; position: relative;
          transition: color 0.2s;
        }
        .feed-tab.active {
          color: #fff;
        }
        .feed-tab.active::after {
          content: ''; position: absolute;
          bottom: -2px; left: 30%; right: 30%;
          height: 2px; background: #fff; border-radius: 1px;
        }
        /* Like animation */
        @keyframes heartPop {
          0% { transform: scale(1); }
          30% { transform: scale(1.3); }
          60% { transform: scale(0.95); }
          100% { transform: scale(1); }
        }
        .liked .icon-wrap { animation: heartPop 0.4s ease; }
        /* Upload FAB */
        .upload-fab {
          position: fixed; bottom: max(env(safe-area-inset-bottom, 0px), 20px);
          left: 50%; transform: translateX(-50%);
          z-index: 50;
          width: 48px; height: 32px; border-radius: 8px;
          background: linear-gradient(135deg, #25F4EE 0%, #FE2C55 100%);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; box-shadow: 0 2px 16px rgba(254,44,85,0.5);
          transition: transform 0.15s;
          overflow: hidden;
        }
        .upload-fab::before {
          content: ''; position: absolute;
          left: 4px; top: 4px; bottom: 4px;
          width: 18px; border-radius: 4px;
          background: #25F4EE;
        }
        .upload-fab::after {
          content: ''; position: absolute;
          right: 4px; top: 4px; bottom: 4px;
          width: 18px; border-radius: 4px;
          background: #FE2C55;
        }
        .upload-fab .plus-icon {
          position: relative; z-index: 2;
          width: 24px; height: 24px; border-radius: 6px;
          background: #fff; display: flex; align-items: center; justify-content: center;
        }
        .upload-fab:active { transform: translateX(-50%) scale(0.92); }
        /* Spinning disc */
        .disc-spin {
          width: 48px; height: 48px; border-radius: 50%;
          border: 3px solid rgba(255,255,255,0.2);
          overflow: hidden; position: relative;
          animation: discSpin 4s linear infinite;
        }
        @keyframes discSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .disc-spin img {
          width: 100%; height: 100%; object-fit: cover;
        }
        .disc-spin::after {
          content: ''; position: absolute;
          top: 50%; left: 50%; transform: translate(-50%,-50%);
          width: 14px; height: 14px; border-radius: 50%;
          background: #000; border: 3px solid rgba(255,255,255,0.3);
        }
      `}} />

      {/* Feed Header */}
      <div className="feed-header">
        <button
          type="button"
          onClick={() => setFeedSource("following")}
          className={`feed-tab ${feedSource === "following" ? "active" : ""}`}
        >
          Urmărești
        </button>
        <button
          type="button"
          onClick={() => setFeedSource("foryou")}
          className={`feed-tab ${feedSource === "foryou" ? "active" : ""}`}
        >
          Pentru Tine
        </button>
      </div>

      {/* Mute toggle */}
      <button className="mute-btn" onClick={toggleMute} aria-label={isMuted ? "Unmute" : "Mute"}>
        {isMuted ? <VolumeX size={18} color="#fff" /> : <Volume2 size={18} color="#fff" />}
      </button>


      {/* Feed Scroll Container */}
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
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
              Fii primul care adaugă un clip!
            </p>
          </div>
        ) : (
          videos.map((video) => (
            <div
              key={video.id}
              data-video-id={video.id}
              className="video-slide"
            >
              {/* Video */}
              <video
                ref={(el) => { if (el) videoRefs.current.set(video.id, el); }}
                src={video.url}
                loop
                muted={isMuted}
                playsInline
                preload={video.id === videos[0]?.id ? "auto" : "none"}
                onClick={toggleMute}
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  if (v.duration) {
                    setProgressMap(prev => ({ ...prev, [video.id]: (v.currentTime / v.duration) * 100 }));
                  }
                }}
              />

              {/* Gradients */}
              <div className="video-gradient-top" />
              <div className="video-gradient" />

              {/* Progress bar */}
              <div className="video-progress">
                <div className="video-progress-fill" style={{ width: `${progressMap[video.id] || 0}%` }} />
              </div>

              {/* Right Action Bar */}
              <div className="action-bar">
                {/* Creator Avatar */}
                <button
                  type="button"
                  className="creator-avatar"
                  onClick={() => handleFollow(video.creator?.id)}
                  aria-label={followingCreators.has(video.creator?.id) ? "Unfollow creator" : "Follow creator"}
                >
                  <img src={video.product?.image || video.thumbnail || '/favicon.ico'} alt="" />
                  <div className="avatar-plus">{followingCreators.has(video.creator?.id) ? "ok" : "+"}</div>
                </button>

                {/* Like */}
                <div className={`action-btn ${likedVideos.has(video.id) ? 'liked' : ''}`} onClick={() => handleLike(video.id)}>
                  <div className="icon-wrap">
                    <Heart 
                      size={28} 
                      color={likedVideos.has(video.id) ? "#ff2d55" : "#fff"}
                      fill={likedVideos.has(video.id) ? "#ff2d55" : "none"}
                    />
                  </div>
                  <span className="count">{formatCount(video.likes)}</span>
                </div>

                {/* Comments */}
                <div className="action-btn" onClick={() => setActiveCommentsVideo(video)}>
                  <div className="icon-wrap">
                    <MessageCircle size={28} color="#fff" />
                  </div>
                  <span className="count">{formatCount(video.comments)}</span>
                </div>

                {/* Save */}
                <div className="action-btn" onClick={() => handleSave(video.id)}>
                  <div className="icon-wrap">
                    <Bookmark 
                      size={28} 
                      color={savedVideos.has(video.id) ? "#fbbf24" : "#fff"}
                      fill={savedVideos.has(video.id) ? "#fbbf24" : "none"}
                    />
                  </div>
                  <span className="count">Salvează</span>
                </div>

                {/* Share */}
                <div className="action-btn" onClick={() => handleShare(video.id)}>
                  <div className="icon-wrap">
                    <Share2 size={28} color="#fff" />
                  </div>
                  <span className="count">{formatCount(video.shares)}</span>
                </div>

                {/* More menu (hide / not interested / report) */}
                <div className="action-btn">
                  <MoreLikeThisMenu
                    videoId={video.id}
                    creatorId={video.creator?.id}
                    isFollowing={followingCreators.has(video.creator?.id)}
                    onActionDone={(action) => {
                      if (action === "not_interested") {
                        setVideos((prev) => prev.filter((v) => v.id !== video.id));
                      }
                    }}
                  />
                </div>

                {/* Spinning disc */}
                <div className="disc-spin">
                  <img src={video.thumbnail || '/favicon.ico'} alt="" />
                </div>
              </div>

              {/* Bottom Content */}
              <div className="bottom-content">
                {/* Creator */}
                <div className="creator-name">@{video.creator?.name || 'Swypik'}</div>

                {/* Description */}
                <p className="video-desc">{video.description}</p>

                {/* Product Chip */}
                {video.product?.id ? (
                  <div className="product-chip" onClick={() => openProduct(video)}>
                    {video.product.image && <img src={video.product.image} alt="" />}
                    <span style={{ fontSize: 13, fontWeight: 500, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {video.product.name || 'Vezi produs'}
                    </span>
                    <span className="chip-price">{video.product.price || 'Vezi'}</span>
                    <div className="chip-buy">
                      <ShoppingCart size={14} color="#fff" />
                    </div>
                  </div>
                ) : (
                  <Link href="/" style={{ textDecoration: 'none' }}>
                    <div className="product-chip">
                      <ShoppingCart size={18} color="#0D0D0D" style={{ marginLeft: 4 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0D0D0D' }}>Cumpără pe Swypik</span>
                    </div>
                  </Link>
                )}

                {/* Music ticker */}
                <div className="music-ticker">
                  <Music size={14} />
                  <div className="marquee">
                    <span>{video.description?.slice(0, 40) || 'Original Sound'} &nbsp;&nbsp;&nbsp; {video.description?.slice(0, 40) || 'Original Sound'} &nbsp;&nbsp;&nbsp;</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Product Drawer */}
      {activeProduct && (
        <ProductDrawer 
          product={activeProduct} 
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
        onCountChange={(nextCount) => {
          if (!activeCommentsVideo?.id) return;
          updateVideo(activeCommentsVideo.id, { comments: String(nextCount) });
          setActiveCommentsVideo((current: any) => current ? { ...current, comments: String(nextCount) } : current);
        }}
      />
    </div>
  );
}
