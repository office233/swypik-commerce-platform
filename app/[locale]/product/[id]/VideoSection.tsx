"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { Clapperboard, Eye, Video as VideoIcon, X } from "lucide-react";

/* ───── Types ───── */
type Video = {
  id: string;
  title: string;
  description: string;
  playbackUrl: string;
  thumbnailUrl: string;
  durationSeconds: number;
  viewCount: number;
  likeCount: number;
  publishedAt: string;
  creatorName: string;
  creatorId: string;
};

/* ───── Helpers ───── */
function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ───── Component ───── */
export default function VideoSection({ productId }: { productId: string }) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);

  useEffect(() => {
    if (!productId) return;
    fetch(`/api/products/${productId}/videos`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.videos)) setVideos(data.videos);
      })
      .catch(() => { });
  }, [productId]);

  const closeLightbox = useCallback(() => setActiveVideo(null), []);

  // Close on Escape key
  useEffect(() => {
    if (!activeVideo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeVideo, closeLightbox]);

  if (videos.length === 0) return null;

  return (
    <>
      <section style={{ marginTop: 24, marginBottom: 8 }}>
        {/* Section Title */}
        <h2
          style={{
            fontSize: 14,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#6E6E80",
            marginBottom: 12,
            paddingLeft: 16,
          }}
        >
          <VideoIcon size={13} style={{ marginRight: 6, verticalAlign: "middle" }} /> Clipuri cu acest produs
        </h2>

        {/* Horizontal Scroll Container */}
        <div
          style={{
            display: "flex",
            gap: 12,
            overflowX: "auto",
            paddingLeft: 16,
            paddingRight: 16,
            paddingBottom: 8,
            scrollbarWidth: "none",
          }}
          className="no-scrollbar"
        >
          {videos.map((video) => (
            <button
              key={video.id}
              type="button"
              onClick={() => setActiveVideo(video)}
              style={{
                flexShrink: 0,
                width: 135,
                background: "#1A1A2E",
                borderRadius: 16,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.06)",
                cursor: "pointer",
                textAlign: "left",
                padding: 0,
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "scale(1.04)";
                (e.currentTarget as HTMLElement).style.boxShadow =
                  "0 8px 32px rgba(16,163,127,0.18)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                (e.currentTarget as HTMLElement).style.boxShadow = "none";
              }}
            >
              {/* Thumbnail */}
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "9/16",
                  maxHeight: 200,
                  overflow: "hidden",
                  background: "#0D0D1A",
                }}
              >
                {video.thumbnailUrl ? (
                  <Image
                    src={video.thumbnailUrl}
                    alt={video.title}
                    fill
                    sizes="135px"
                    className="object-cover"
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "grid",
                      placeItems: "center",
                      color: "#444",
                      fontSize: 32,
                    }}
                  >
                    <Clapperboard size={32} />
                  </div>
                )}

                {/* Play Button Overlay */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    placeItems: "center",
                    background:
                      "linear-gradient(to top, rgba(0,0,0,0.55), transparent 50%)",
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.92)",
                      display: "grid",
                      placeItems: "center",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
                    }}
                  >
                    <svg
                      width="16"
                      height="18"
                      viewBox="0 0 16 18"
                      fill="none"
                    >
                      <path d="M15 9L1 17V1L15 9Z" fill="#0D0D0D" />
                    </svg>
                  </div>
                </div>

                {/* Duration Badge */}
                <span
                  style={{
                    position: "absolute",
                    bottom: 6,
                    right: 6,
                    background: "rgba(0,0,0,0.72)",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 6,
                    backdropFilter: "blur(4px)",
                  }}
                >
                  {formatDuration(video.durationSeconds)}
                </span>
              </div>

              {/* Card Info */}
              <div style={{ padding: "8px 10px 10px" }}>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#E0E0E0",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    margin: 0,
                  }}
                >
                  {video.creatorName}
                </p>
                <p
                  style={{
                    fontSize: 10,
                    color: "#8E8EA0",
                    margin: "3px 0 0",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Eye size={12} /> {formatViews(video.viewCount)}</span>
                  <span>·</span>
                  <span>{formatDuration(video.durationSeconds)}</span>
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ─── Lightbox Modal ─── */}
      {activeVideo && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeLightbox}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.88)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            animation: "vsModalIn 0.25s ease-out",
          }}
        >
          {/* Close Button */}
          <button
            type="button"
            onClick={closeLightbox}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "none",
              background: "rgba(255,255,255,0.12)",
              color: "#fff",
              fontSize: 22,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              backdropFilter: "blur(8px)",
              zIndex: 10,
            }}
          >
            <X size={20} />
          </button>

          {/* Video Player */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 420,
              maxHeight: "80vh",
              aspectRatio: "9/16",
              borderRadius: 20,
              overflow: "hidden",
              background: "#000",
              boxShadow: "0 16px 64px rgba(0,0,0,0.6)",
            }}
          >
            <video
              src={activeVideo.playbackUrl}
              autoPlay
              controls
              playsInline
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>

          {/* Video Title */}
          <p
            style={{
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              marginTop: 12,
              textAlign: "center",
              maxWidth: 400,
            }}
          >
            {activeVideo.title}
          </p>
          <p
            style={{
              color: "#8E8EA0",
              fontSize: 12,
              marginTop: 4,
            }}
          >
            {activeVideo.creatorName} · {formatViews(activeVideo.viewCount)}
          </p>
        </div>
      )}

      {/* Keyframe animation injected once */}
      <style jsx global>{`
        @keyframes vsModalIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
}
