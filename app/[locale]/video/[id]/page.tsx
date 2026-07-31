/**
 * Video SEO Landing Page — Server Component
 *
 * Serves as the canonical URL for each video (/video/:id).
 * Generates full OpenGraph + Twitter metadata for social sharing,
 * then auto-redirects to /explore?v=:id where the real player lives.
 */

import { Metadata } from "next";
import Link from "next/link";
import { parseHashtags } from "@/lib/text/parseHashtags";
import { dbQuery } from "@/lib/db";
import { redirect } from "next/navigation";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { languagesForMetadata } from "@/lib/seo/hreflang";
import { APP_URL } from "@/lib/app-url";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";


// ── Shared fetch helper ─────────────────────────────────────────
async function getVideo(id: string) {
  try {
    const { rows } = await dbQuery(
      `SELECT v.id, v.title, v.description, v.thumbnail_url, v.playback_url,
              v.duration_ms, v.view_count, v.published_at,
              u.display_name AS creator_name
       FROM videos v
       JOIN users u ON v.creator_id = u.id
       WHERE v.id = $1
         AND v.status = 'ready'
         AND v.visibility = 'public'
         AND COALESCE(v.is_hidden, false) = false
         AND v.effective_label = 'safe'`,
      [id]
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

// ── Metadata ────────────────────────────────────────────────────
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const video = await getVideo(id);

  if (!video) {
    return { title: "Video negăsit — Swypik" };
  }

  const rawCreator = (video.creator_name || "").trim();
  const isGenericCreator = !rawCreator || /^(swypik|swypik\s*system|system|bot|admin)$/i.test(rawCreator);
  const creatorSuffix = isGenericCreator ? "" : ` de ${rawCreator}`;
  const title = `${video.title}${creatorSuffix} — Swypik`;
  const description = video.description
    ? video.description.replace(/<[^>]*>/g, " ").trim().slice(0, 155)
    : `Vizionează ${video.title} pe Swypik — social video commerce.`;

  const canonical = `${APP_URL}/video/${id}`;
  const languages = languagesForMetadata(`/video/${id}`);
  return {
    title,
    description,
    alternates: { canonical, languages },
    openGraph: {
      title: video.title,
      description,
      type: "video.other",
      url: canonical,
      siteName: "Swypik",
      locale: "ro_RO",
      ...(video.playback_url
        ? {
            videos: [
              {
                url: video.playback_url,
                type: "video/mp4",
                ...(video.duration_ms ? { duration: Math.round(video.duration_ms / 1000) } : {}),
              },
            ],
          }
        : {}),
      ...(video.thumbnail_url
        ? { images: [{ url: video.thumbnail_url, width: 720, height: 1280 }] }
        : {}),
    },
    twitter: {
      card: "player",
      title: video.title,
      description,
      ...(video.thumbnail_url ? { images: [video.thumbnail_url] } : {}),
    },
  };
}

// ── Page Component ──────────────────────────────────────────────
export default async function VideoPage({ params }: Props) {
  const { id } = await params;
  const video = await getVideo(id);

  if (!video) {
    redirect("/explore");
  }

  const creatorLabel = video.creator_name || "Creator";
  const formattedViews = Number(video.view_count || 0).toLocaleString("ro-RO");

  return (
    <>
      {/* JSON-LD for VideoObject structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "VideoObject",
            name: video.title,
            description: video.description || video.title,
            thumbnailUrl: video.thumbnail_url,
            contentUrl: video.playback_url,
            uploadDate: video.published_at
              ? new Date(video.published_at).toISOString()
              : undefined,
            duration: video.duration_ms
              ? `PT${Math.floor(video.duration_ms / 60000)}M${Math.floor((video.duration_ms % 60000) / 1000)}S`
              : undefined,
            interactionStatistic: {
              "@type": "InteractionCounter",
              interactionType: { "@type": "WatchAction" },
              userInteractionCount: video.view_count || 0,
            },
            author: {
              "@type": "Person",
              name: creatorLabel,
            },
          }),
        }}
      />

      {/* Breadcrumb JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: `${APP_URL}/` },
              { "@type": "ListItem", position: 2, name: "Explore", item: `${APP_URL}/explore` },
              { "@type": "ListItem", position: 3, name: (video.title || "Video").slice(0, 80), item: `${APP_URL}/video/${id}` },
            ],
          }),
        }}
      />

      {/* Auto-redirect script — redirects to the real player after 1s */}
      <script
        dangerouslySetInnerHTML={{
          __html: `setTimeout(function(){window.location.href="/explore?v="+${JSON.stringify(encodeURIComponent(id))}},1000);`,
        }}
      />

      {/* SEO landing page — visible to crawlers & slow connections */}
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a0a1e 50%, #0a0a0a 100%)",
          fontFamily: "var(--font-inter), system-ui, sans-serif",
          color: "#fff",
          padding: "24px",
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: "100%",
            textAlign: "center",
          }}
        >
          {/* Thumbnail */}
          {video.thumbnail_url && (
            <div
              style={{
                position: "relative",
                borderRadius: 20,
                overflow: "hidden",
                marginBottom: 24,
                boxShadow: "0 20px 60px rgba(225, 29, 72, 0.15), 0 0 0 1px rgba(255,255,255,0.08)",
                aspectRatio: "9 / 16",
                maxHeight: 480,
                margin: "0 auto 24px",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={video.thumbnail_url}
                alt={video.title}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
              {/* Gradient overlay */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.7) 100%)",
                }}
              />
              {/* Play button overlay */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: "50%",
                    background: "rgba(225, 29, 72, 0.9)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 8px 32px rgba(225, 29, 72, 0.4)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="white"
                    style={{ marginLeft: 3 }}
                  >
                    <polygon points="5,3 19,12 5,21" />
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* Title */}
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 1.3,
              margin: "0 0 8px",
              letterSpacing: "-0.01em",
            }}
          >
            {parseHashtags(video.title)}
          </h1>

          {/* Creator */}
          <p
            style={{
              fontSize: 15,
              color: "rgba(255,255,255,0.6)",
              margin: "0 0 6px",
            }}
          >
            de <span style={{ color: "#f43f5e", fontWeight: 600 }}>{creatorLabel}</span>
          </p>

          {/* View count */}
          <p
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.4)",
              margin: "0 0 16px",
            }}
          >
            {formattedViews} vizualizări
          </p>

          {/* Description with hashtag + mention links */}
          {video.description && (
            <p
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.75)",
                lineHeight: 1.5,
                margin: "0 0 24px",
                textAlign: "left",
              }}
            >
              {parseHashtags(video.description)}
            </p>
          )}

          {/* CTA button */}
          <a
            href={`/explore?v=${id}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "14px 36px",
              borderRadius: 14,
              background: "linear-gradient(135deg, #e11d48 0%, #be123c 100%)",
              color: "#fff",
              fontSize: 16,
              fontWeight: 700,
              textDecoration: "none",
              boxShadow: "0 8px 24px rgba(225, 29, 72, 0.35)",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
            }}
          >
            <span style={{ fontSize: 20 }}>▶</span> Vizionează
          </a>

          {/* Redirect notice */}
          <p
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.3)",
              marginTop: 20,
            }}
          >
            Redirecționare automată…
          </p>
        </div>
      </div>
    </>
  );
}
