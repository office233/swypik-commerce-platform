"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Video,
  Upload,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Film,
  ArrowRight,
  Calendar,
  Package,
} from "lucide-react";

interface CreatorVideo {
  id: string;
  status: string;
  video_url: string | null;
  description: string | null;
  created_at: string;
  product_title: string | null;
  product_id: string | null;
  product_image: string | null;
}

function StatusBadge({ status, className }: { status: string; className?: string }) {
  const base =
    "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide select-none";

  switch (status) {
    case "processing":
      return (
        <span className={`${base} bg-amber-400/20 text-amber-600 ${className ?? ""}`}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          Se procesează...
        </span>
      );
    case "ready":
      return (
        <span className={`${base} bg-[#0D0D0D]/15 text-[#0D0D0D] ${className ?? ""}`}>
          <CheckCircle2 className="w-3.5 h-3.5" />
          Gata
        </span>
      );
    case "failed":
    case "rejected":
      return (
        <span
          className={`${base} bg-red-500/15 text-red-600 ${className ?? ""}`}
          title={status === "failed" ? "Procesarea a eșuat" : "Videoclipul a fost respins"}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          {status === "failed" ? "Eroare" : "Respins"}
        </span>
      );
    default:
      return (
        <span className={`${base} bg-gray-200 text-gray-500 ${className ?? ""}`}>
          <Clock className="w-3.5 h-3.5" />
          Așteptare
        </span>
      );
  }
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function VideoCard({ video }: { video: CreatorVideo }) {
  return (
    <div className="group relative bg-[#1A1A1A] rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 flex flex-col">
      {/* Thumbnail / Placeholder */}
      <div className="relative aspect-[9/16] max-h-[280px] w-full bg-gradient-to-br from-[#2A2A2A] to-[#1A1A1A] flex items-center justify-center overflow-hidden">
        {video.product_image ? (
          <Image
            src={video.product_image}
            alt={video.product_title ?? "Video"}
            fill
            sizes="(max-width: 768px) 50vw, 240px"
            className="object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-600">
            <Video className="w-12 h-12" />
            <span className="text-xs font-medium">Fără previzualizare</span>
          </div>
        )}

        {/* Status overlay */}
        <div className="absolute top-3 left-3">
          <StatusBadge status={video.status} />
        </div>

        {/* Play overlay on hover (only for ready videos) */}
        {video.status === "ready" && video.video_url && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-[#0D0D0D] ml-1" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 flex flex-col p-5 gap-3">
        {/* Product title */}
        {video.product_title && (
          <div className="flex items-start gap-2">
            <Package className="w-4 h-4 text-[#0D0D0D] mt-0.5 shrink-0" />
            <p className="text-sm font-black text-white leading-tight line-clamp-2">
              {video.product_title}
            </p>
          </div>
        )}

        {/* Description */}
        {video.description && (
          <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">
            {video.description}
          </p>
        )}

        {/* Footer metadata */}
        <div className="mt-auto pt-3 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-gray-500">
            <Calendar className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold">{formatDate(video.created_at)}</span>
          </div>
          {video.status === "ready" && (
            <span className="text-[11px] font-bold text-[#0D0D0D]">● Live</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CreatorVideosPage() {
  const [videos, setVideos] = useState<CreatorVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function fetchVideos(initial: boolean) {
      try {
        const res = await fetch("/api/creator/videos", { cache: "no-store" });
        if (!res.ok) throw new Error("Eroare la încărcarea videoclipurilor.");
        const data = await res.json();
        if (cancelled) return;
        const list: CreatorVideo[] = data.videos || [];
        setVideos(list);
        setError(null);
        // Re-poll while any video still processes
        const stillProcessing = list.some(
          (v) => v.status === "processing" || v.status === "uploading"
        );
        if (stillProcessing && !cancelled) {
          timer = setTimeout(() => fetchVideos(false), 10000);
        }
      } catch (err: any) {
        if (!cancelled && initial) setError(err.message);
      } finally {
        if (initial && !cancelled) setLoading(false);
      }
    }
    fetchVideos(true);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#0D0D0D] tracking-tight">
            Clipurile Mele
          </h1>
          <p className="text-[#6E6E80] mt-1 text-sm font-medium">
            Toate videoclipurile tale încărcate, într-un singur loc.
          </p>
        </div>
        <Link
          href="/upload"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#0D0D0D] hover:bg-[#0D8F6F] text-white font-black rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 active:scale-[0.97] text-sm whitespace-nowrap"
        >
          <Upload className="w-4 h-4" />
          Încarcă clip nou
        </Link>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-[#0D0D0D]/20" />
            <Loader2 className="w-16 h-16 text-[#0D0D0D] animate-spin absolute inset-0" />
          </div>
          <p className="text-sm font-bold text-[#6E6E80]">Se încarcă videoclipurile...</p>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
          <p className="font-bold text-red-700">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-5 py-2 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-colors text-sm"
          >
            Reîncearcă
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && videos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-6">
          <div className="w-24 h-24 rounded-3xl bg-[#0D0D0D]/10 flex items-center justify-center">
            <Film className="w-12 h-12 text-[#0D0D0D]" />
          </div>
          <div className="text-center max-w-sm">
            <h2 className="text-xl font-black text-[#0D0D0D] mb-2">
              Nu ai niciun clip încărcat
            </h2>
            <p className="text-sm text-[#6E6E80] leading-relaxed">
              Începe să promovezi produse încărcând primul tău videoclip. Este rapid și simplu!
            </p>
          </div>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 px-8 py-4 bg-[#0D0D0D] hover:bg-[#2A2A2A] text-white font-black rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 active:scale-[0.97]"
          >
            Mergi la Upload
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      )}

      {/* Video Grid */}
      {!loading && !error && videos.length > 0 && (
        <>
          {/* Stats bar */}
          <div className="flex items-center gap-6 text-sm">
            <span className="font-black text-[#0D0D0D]">
              {videos.length} {videos.length === 1 ? "clip" : "clipuri"}
            </span>
            <span className="text-[#6E6E80]">•</span>
            <span className="text-[#0D0D0D] font-bold">
              {videos.filter((v) => v.status === "ready").length} live
            </span>
            {videos.filter((v) => v.status === "processing").length > 0 && (
              <>
                <span className="text-[#6E6E80]">•</span>
                <span className="text-amber-600 font-bold">
                  {videos.filter((v) => v.status === "processing").length} în procesare
                </span>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {videos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
