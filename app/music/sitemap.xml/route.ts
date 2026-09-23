/**
 * Music Sitemap — referenced by /sitemap.xml index.
 * Generates XML containing:
 * - Main music hub (/music)
 * - Music genres (/music?genre=...)
 * - Local tracks, artists, and albums from DB
 * - Cached tracks and artists
 */

import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { APP_URL } from "@/lib/app-url";
import { MUSIC_GENRES } from "@/lib/music/genres";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const BASE_URL = APP_URL;

type SitemapEntry = {
    loc: string;
    lastmod: string;
    changefreq: string;
    priority: number;
};

export async function GET() {
    const now = new Date().toISOString();
    const entries: SitemapEntry[] = [
        { loc: `${BASE_URL}/music`, lastmod: now, changefreq: "daily", priority: 0.9 },
    ];

    // 1. Genuri muzicale
    for (const g of MUSIC_GENRES) {
        entries.push({
            loc: `${BASE_URL}/music?genre=${encodeURIComponent(g)}`,
            lastmod: now,
            changefreq: "daily",
            priority: 0.8,
        });
    }

    // 2. Piese din baza de date locală
    try {
        const { rows: tracks } = await dbQuery<{ slug: string; updated_at: string }>(
            "SELECT slug, updated_at FROM music_tracks WHERE status = 'published' ORDER BY updated_at DESC LIMIT 5000"
        );
        for (const t of tracks) {
            entries.push({
                loc: `${BASE_URL}/music/track/${t.slug}`,
                lastmod: t.updated_at ? new Date(t.updated_at).toISOString() : now,
                changefreq: "weekly",
                priority: 0.7,
            });
        }
    } catch {
        // Ignorat dacă DB-ul este offline
    }

    // 3. Artiști din baza de date locală
    try {
        const { rows: artists } = await dbQuery<{ slug: string; updated_at: string }>(
            "SELECT slug, updated_at FROM music_artists ORDER BY updated_at DESC LIMIT 2000"
        );
        for (const a of artists) {
            entries.push({
                loc: `${BASE_URL}/music/artist/${a.slug}`,
                lastmod: a.updated_at ? new Date(a.updated_at).toISOString() : now,
                changefreq: "weekly",
                priority: 0.75,
            });
        }
    } catch {
        // Ignorat dacă DB-ul este offline
    }

    // 4. Albume din baza de date locală
    try {
        const { rows: albums } = await dbQuery<{ slug: string; updated_at: string }>(
            "SELECT slug, updated_at FROM music_albums WHERE status = 'published' ORDER BY updated_at DESC LIMIT 2000"
        );
        for (const al of albums) {
            entries.push({
                loc: `${BASE_URL}/music/album/${al.slug}`,
                lastmod: al.updated_at ? new Date(al.updated_at).toISOString() : now,
                changefreq: "weekly",
                priority: 0.7,
            });
        }
    } catch {
        // Ignorat dacă DB-ul este offline
    }

    // 5. Piese externe din cache (youtube_tracks)
    try {
        const { rows: ytTracks } = await dbQuery<{ video_id: string; created_at: string }>(
            "SELECT video_id, created_at FROM youtube_tracks ORDER BY created_at DESC LIMIT 10000"
        );
        for (const yt of ytTracks) {
            entries.push({
                loc: `${BASE_URL}/music/track/yt-${yt.video_id}`,
                lastmod: yt.created_at ? new Date(yt.created_at).toISOString() : now,
                changefreq: "monthly",
                priority: 0.65,
            });
        }
    } catch {
        // Ignorat dacă tabela nu există încă
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
    .map(
        (e) => `  <url>
    <loc>${e.loc}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`
    )
    .join("\n")}
</urlset>
`;

    return new NextResponse(xml, {
        status: 200,
        headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
    });
}
