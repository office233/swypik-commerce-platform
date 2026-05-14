"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Bookmark, Heart, MoreVertical, Trash2 } from "lucide-react";

type SavedVideo = {
  id: string;
  title: string | null;
  thumbnail: string | null;
  durationMs: number | null;
  likeCount: number;
  viewCount: number;
  creatorUsername: string | null;
  creatorDisplayName: string | null;
  creatorAvatar: string | null;
  savedAt: string;
};

type Props = {
  limit?: number;
  showHeader?: boolean;
  enableInfiniteScroll?: boolean;
};

export default function SavedVideosTab({ limit = 50, showHeader = false, enableInfiniteScroll = false }: Props) {
  const [videos, setVideos] = useState<SavedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(
    async (currentOffset: number, append: boolean) => {
      try {
        if (append) setLoadingMore(true);
        else setLoading(true);
        const res = await fetch(`/api/users/me/saved-videos?limit=${limit}&offset=${currentOffset}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (res.status === 401) {
            setError("Trebuie să te autentifici.");
            return;
          }
          throw new Error("fetch_failed");
        }
        const data = await res.json();
        const next: SavedVideo[] = data.videos || [];
        setVideos((prev) => (append ? [...prev, ...next] : next));
        setHasMore(Boolean(data.hasMore));
        setOffset(currentOffset + next.length);
      } catch (e) {
        setError("Nu am putut încărca clipurile salvate.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [limit],
  );

  useEffect(() => {
    void fetchPage(0, false);
  }, [fetchPage]);

  const handleUnsave = useCallback(async (videoId: string) => {
    setMenuId(null);
    const prev = videos;
    setVideos((vs) => vs.filter((v) => v.id !== videoId));
    try {
      const res = await fetch(`/api/videos/${videoId}/save`, { method: "POST" });
      if (!res.ok) throw new Error("unsave_failed");
    } catch {
      setVideos(prev);
    }
  }, [videos]);

  if (loading) {
    return (
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 p-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="aspect-[9/16] bg-white/5 animate-pulse rounded" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-20 text-center text-white/40">
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="py-20 text-center text-white/40">
        <Bookmark size={32} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">Clipurile pe care le salvezi vor apărea aici.</p>
        <Link href="/explore" className="inline-block mt-3 text-xs text-white/70 underline">
          Descoperă clipuri
        </Link>
      </div>
    );
  }

  return (
    <div>
      {showHeader && (
        <div className="px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Clipuri salvate</h2>
          <span className="text-xs text-white/40">{videos.length}</span>
        </div>
      )}
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 p-2">
        {videos.map((v) => (
          <div key={v.id} className="aspect-[9/16] bg-white/5 relative group rounded overflow-hidden">
            <Link href={`/video/${v.id}`} aria-label={v.title || "Clip"} className="absolute inset-0">
              {v.thumbnail ? (
                <Image
                  src={v.thumbnail}
                  alt={v.title || "Clip salvat"}
                  fill
                  sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 20vw"
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="w-full h-full bg-white/10" />
              )}
            </Link>
            <div className="absolute bottom-1 left-2 flex items-center gap-1 text-[10px] font-bold text-white drop-shadow pointer-events-none">
              <Heart size={10} fill="currentColor" /> {v.likeCount}
            </div>
            <button
              type="button"
              aria-label="Opțiuni clip"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuId(menuId === v.id ? null : v.id);
              }}
              className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <MoreVertical size={14} />
            </button>
            {menuId === v.id && (
              <div className="absolute top-8 right-1 bg-zinc-900 border border-white/10 rounded shadow-lg z-10 text-xs">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void handleUnsave(v.id);
                  }}
                  className="flex items-center gap-2 px-3 py-2 w-full hover:bg-white/5 text-left whitespace-nowrap"
                >
                  <Trash2 size={12} /> Elimină din salvate
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {enableInfiniteScroll && hasMore && (
        <div className="py-4 text-center">
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void fetchPage(offset, true)}
            className="px-4 py-2 text-xs bg-white/10 hover:bg-white/20 rounded disabled:opacity-50"
          >
            {loadingMore ? "Se încarcă..." : "Încarcă mai multe"}
          </button>
        </div>
      )}
    </div>
  );
}
