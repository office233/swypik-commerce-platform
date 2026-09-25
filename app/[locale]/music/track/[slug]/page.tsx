import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isEnabled } from "@/lib/feature-flags";
import { getTrackBySlug } from "@/lib/music/repository";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { languagesForMetadata } from "@/lib/seo/hreflang";
import { APP_URL } from "@/lib/app-url";
import TrackClient from "./TrackClient";

export const dynamic = "force-dynamic";

type Props = {
    params: Promise<{ locale: string; slug: string }>;
};

async function resolveTrack(slug: string) {
    let dbTrack = null;
    try {
        dbTrack = await getTrackBySlug(slug);
    } catch {
        dbTrack = null;
    }
    if (dbTrack) {
        return {
            id: dbTrack.id,
            slug: dbTrack.slug,
            title: dbTrack.title,
            coverUrl: dbTrack.cover_url,
            genre: dbTrack.genre,
            durationMs: dbTrack.duration_ms,
            artist: {
                id: dbTrack.artist.user_id,
                slug: dbTrack.artist.slug,
                stageName: dbTrack.artist.stage_name,
            },
        };
    }
    return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const track = await resolveTrack(slug);

    if (!track) {
        return {
            title: "Piesă negăsită — Swypik Music",
            description: "Ascultă muzică gratuită și melodii populare pe Swypik Music.",
        };
    }

    const title = `${track.title} - ${track.artist.stageName} | Swypik Music`;
    const description = `Ascultă melodia "${track.title}" de ${track.artist.stageName} pe Swypik Music. Streaming audio de înaltă calitate, videoclip și versuri.`;
    const canonical = `${APP_URL}/music/track/${slug}`;
    const languages = languagesForMetadata(`/music/track/${slug}`);

    return {
        title,
        description,
        alternates: { canonical, languages },
        openGraph: {
            title,
            description,
            type: "music.song",
            url: canonical,
            siteName: "Swypik Music",
            locale: "ro_RO",
            ...(track.coverUrl
                ? {
                      images: [
                          {
                              url: track.coverUrl,
                              width: 600,
                              height: 600,
                              alt: `${track.title} - ${track.artist.stageName}`,
                          },
                      ],
                  }
                : {}),
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            ...(track.coverUrl ? { images: [track.coverUrl] } : {}),
        },
    };
}

export default async function TrackPage({ params }: Props) {
    if (!isEnabled("music")) notFound();
    const { slug } = await params;
    const track = await resolveTrack(slug);

    const minutes = track ? Math.floor(track.durationMs / 60000) : 3;
    const seconds = track ? Math.floor((track.durationMs % 60000) / 1000) : 0;
    const isoDuration = `PT${minutes}M${seconds}S`;

    const jsonLd = track
        ? {
              "@context": "https://schema.org",
              "@type": "MusicRecording",
              name: track.title,
              url: `${APP_URL}/music/track/${slug}`,
              image: track.coverUrl || undefined,
              duration: isoDuration,
              genre: track.genre,
              byArtist: {
                  "@type": "MusicGroup",
                  name: track.artist.stageName,
                  url: `${APP_URL}/music/artist/${track.artist.slug}`,
              },
              inLanguage: "ro",
              publisher: {
                  "@type": "Organization",
                  name: "Swypik Music",
                  url: APP_URL,
              },
          }
        : null;

    return (
        <>
            {jsonLd && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
                />
            )}
            <TrackClient slug={slug} />
        </>
    );
}
