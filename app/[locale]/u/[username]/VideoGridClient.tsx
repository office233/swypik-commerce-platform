"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { Film, Play } from "lucide-react";

type Video = {
  id: string;
  title?: string | null;
  description?: string | null;
  thumbnailUrl?: string | null;
  durationMs?: number | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  saveCount: number;
  shareCount: number;
};

function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}

export default function VideoGridClient({
  username,
  creatorId,
  initialVideos,
  initialHasMore,
}: {
  username: string;
  creatorId?: string;
  initialVideos: Video[];
  initialHasMore: boolean;
}) {
  const [videos, setVideos] = useState<Video[]>(initialVideos);
  const [page, setPage] = useState(2);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/users/profile/${encodeURIComponent(username)}/videos?page=${page}&limit=24`, { cache: "no-store" });
      const data = await r.json();
      if (Array.isArray(data?.videos) && data.videos.length > 0) {
        setVideos((prev) => [...prev, ...data.videos]);
        setPage((p) => p + 1);
        setHasMore(Boolean(data.hasMore));
      } else {
        setHasMore(false);
      }
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [hasMore, loading, page, username]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "400px" }
    );
    io.observe(sentinelRef.current);
    return () => io.disconnect();
  }, [loadMore]);

  return (
    <>
      <div className="grid grid-cols-3 gap-0.5">
        {videos.map((video) => (
          <Link
            key={video.id}
            href={`/explore?v=${encodeURIComponent(video.id)}${creatorId ? `&creator_id=${encodeURIComponent(creatorId)}` : ""}`}
            className="group block"
          >
            <div className="relative aspect-[9/16] overflow-hidden bg-[#1A1A1A]">
              {video.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={video.thumbnailUrl} alt={video.title || "Clip"} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="grid h-full w-full place-items-center text-white/25">
                  <Film size={28} strokeWidth={1.5} />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
              <div className="absolute bottom-1 left-1.5 flex items-center gap-1 text-[10px] font-bold text-white/95">
                <Play size={11} fill="currentColor" />
                {formatCount(video.viewCount)}
              </div>
            </div>
          </Link>
        ))}
      </div>
      {hasMore && (
        <div ref={sentinelRef} className="py-6 text-center text-white/40 text-sm">
          {loading ? "Se incarca..." : ""}
        </div>
      )}
    </>
  );
}
