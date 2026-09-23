/**
 * YouTube Data API v3 Client pentru Swypik Music.
 * Caută piese, extrage metadate (titlu, artist/canal, copertă, durată)
 * și le formatează unificat în TrackDto.
 * Include persistență în DB (PostgreSQL 7 zile) + cache în memorie
 * pentru a nu depăși cota zilnică de 10.000 unități.
 */

import type { TrackDto } from "./types";

interface CacheEntry {
    tracks: TrackDto[];
    expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 ore în memorie

/** Parsează durate ISO 8601 (ex: PT3M45S, PT1H2M30S) în milisecunde */
export function parseIsoDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 180_000; // 3 min default
    const hours = parseInt(match[1] || "0", 10);
    const minutes = parseInt(match[2] || "0", 10);
    const seconds = parseInt(match[3] || "0", 10);
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

/** Decodează entități HTML uzuale returnate de YouTube API */
export function cleanHtmlEntities(str: string): string {
    return str
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
}

/** Piese demonstrative reale cu ID-uri YouTube valide când API key lipsește sau cota e atinsă */
const FALLBACK_DEMO_TRACKS: TrackDto[] = [
    {
        id: "yt_kJQP7kiw5Fk",
        slug: "yt-kJQP7kiw5Fk",
        title: "Despacito",
        coverUrl: "https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg",
        genre: "latino",
        durationMs: 282000,
        explicit: false,
        isPremium: false,
        priceUnits: null,
        locked: false,
        allowReels: false,
        audioTrackId: null,
        albumId: null,
        trackNumber: null,
        artist: {
            id: "UCb2HGwORvAakq_0XWlsXfCw",
            slug: "luis-fonsi",
            stageName: "Luis Fonsi ft. Daddy Yankee",
            bio: "Official Artist Channel",
            avatarUrl: null,
            coverUrl: null,
            isOfficial: false,
        },
        plays7d: 1450,
        liked: false,
        source: "youtube",
        youtubeVideoId: "kJQP7kiw5Fk",
    },
    {
        id: "yt_JGwWNGJdvx8",
        slug: "yt-JGwWNGJdvx8",
        title: "Shape of You",
        coverUrl: "https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg",
        genre: "pop",
        durationMs: 263000,
        explicit: false,
        isPremium: false,
        priceUnits: null,
        locked: false,
        allowReels: false,
        audioTrackId: null,
        albumId: null,
        trackNumber: null,
        artist: {
            id: "UC0C-w0YjGpqDXGB8Tr0GGyA",
            slug: "ed-sheeran",
            stageName: "Ed Sheeran",
            bio: "Official Artist Channel",
            avatarUrl: null,
            coverUrl: null,
            isOfficial: false,
        },
        plays7d: 2310,
        liked: false,
        source: "youtube",
        youtubeVideoId: "JGwWNGJdvx8",
    },
    {
        id: "yt_4NRXx6U8ABQ",
        slug: "yt-4NRXx6U8ABQ",
        title: "Blinding Lights",
        coverUrl: "https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg",
        genre: "synthwave",
        durationMs: 260000,
        explicit: false,
        isPremium: false,
        priceUnits: null,
        locked: false,
        allowReels: false,
        audioTrackId: null,
        albumId: null,
        trackNumber: null,
        artist: {
            id: "UC0WP5P-ufpRfjbNrmOWwLBQ",
            slug: "the-weeknd",
            stageName: "The Weeknd",
            bio: "Official Artist Channel",
            avatarUrl: null,
            coverUrl: null,
            isOfficial: false,
        },
        plays7d: 3100,
        liked: false,
        source: "youtube",
        youtubeVideoId: "4NRXx6U8ABQ",
    },
    {
        id: "yt_fJ9rUzIMcZQ",
        slug: "yt-fJ9rUzIMcZQ",
        title: "Bohemian Rhapsody",
        coverUrl: "https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg",
        genre: "rock",
        durationMs: 359000,
        explicit: false,
        isPremium: false,
        priceUnits: null,
        locked: false,
        allowReels: false,
        audioTrackId: null,
        albumId: null,
        trackNumber: null,
        artist: {
            id: "UCiMhD4jzUqG-IgPzUmmytRQ",
            slug: "queen-official",
            stageName: "Queen",
            bio: "Official Artist Channel",
            avatarUrl: null,
            coverUrl: null,
            isOfficial: false,
        },
        plays7d: 980,
        liked: false,
        source: "youtube",
        youtubeVideoId: "fJ9rUzIMcZQ",
    },
];

async function getCachedTracksFromDb(query: string): Promise<TrackDto[] | null> {
    try {
        const { dbQuery } = await import("@/lib/db");
        const { rows } = await dbQuery<{ tracks: TrackDto[] }>(
            "SELECT tracks FROM youtube_music_cache WHERE query = $1 AND expires_at > now()",
            [query.toLowerCase()]
        );
        return rows[0]?.tracks ?? null;
    } catch {
        return null;
    }
}

async function saveCachedTracksToDb(query: string, tracks: TrackDto[]): Promise<void> {
    try {
        const { dbQuery } = await import("@/lib/db");
        await dbQuery(
            `INSERT INTO youtube_music_cache (query, tracks, expires_at)
             VALUES ($1, $2, now() + interval '7 days')
             ON CONFLICT (query) DO UPDATE SET tracks = EXCLUDED.tracks, expires_at = EXCLUDED.expires_at`,
            [query.toLowerCase(), JSON.stringify(tracks)]
        );

        for (const tr of tracks) {
            if (tr.youtubeVideoId) {
                await dbQuery(
                    `INSERT INTO youtube_tracks (video_id, title, channel, cover_url, duration_ms)
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (video_id) DO NOTHING`,
                    [tr.youtubeVideoId, tr.title, tr.artist.stageName, tr.coverUrl, tr.durationMs]
                ).catch(() => {});
            }
        }
    } catch {
        // Ignorat dacă DB-ul este offline sau tabela încă nu a fost creată
    }
}

/**
 * Caută piese pe YouTube folosind YouTube Data API v3 (categorie Music).
 * 1. Verifică memoria cache.
 * 2. Verifică baza de date PostgreSQL (salvare 7 zile, 0 cost cotă API).
 * 3. Apelează YouTube API doar dacă nu este deja salvat.
 */
export async function searchYouTubeMusic(query: string, limit = 15): Promise<TrackDto[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const cacheKey = `yt:search:${trimmed.toLowerCase()}:${limit}`;

    // 1. Verificare memorie rapidă
    const cached = memoryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.tracks;
    }

    // 2. Verificare bază de date PostgreSQL (pentru a economisi cota YouTube)
    const dbCached = await getCachedTracksFromDb(trimmed);
    if (dbCached && dbCached.length > 0) {
        memoryCache.set(cacheKey, { tracks: dbCached, expiresAt: Date.now() + CACHE_TTL_MS });
        return dbCached.slice(0, limit);
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
        // Fallback demonstrativ dacă lipsește cheia API
        const filtered = FALLBACK_DEMO_TRACKS.filter(
            (t) =>
                t.title.toLowerCase().includes(trimmed.toLowerCase()) ||
                t.artist.stageName.toLowerCase().includes(trimmed.toLowerCase())
        );
        const result = filtered.length > 0 ? filtered : FALLBACK_DEMO_TRACKS.slice(0, limit);
        memoryCache.set(cacheKey, { tracks: result, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
    }

    try {
        // 1. Căutare video-uri din categoria Muzică (videoCategoryId=10)
        const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
        searchUrl.searchParams.set("part", "snippet");
        searchUrl.searchParams.set("q", trimmed);
        searchUrl.searchParams.set("type", "video");
        searchUrl.searchParams.set("videoCategoryId", "10");
        searchUrl.searchParams.set("maxResults", String(Math.min(limit, 25)));
        searchUrl.searchParams.set("key", apiKey);

        const searchRes = await fetch(searchUrl.toString(), { next: { revalidate: 3600 } });
        if (!searchRes.ok) {
            console.warn(`[YouTube API] Search failed with status ${searchRes.status}`);
            return FALLBACK_DEMO_TRACKS.slice(0, limit);
        }

        const searchData = (await searchRes.json()) as {
            items?: Array<{
                id: { videoId: string };
                snippet: {
                    title: string;
                    channelTitle: string;
                    channelId: string;
                    thumbnails?: {
                        high?: { url: string };
                        medium?: { url: string };
                        default?: { url: string };
                    };
                };
            }>;
        };

        const items = searchData.items || [];
        if (items.length === 0) return [];

        const videoIds = items.map((i) => i.id.videoId).filter(Boolean);

        // 2. Cerem detaliile fiecărui video pentru a afla durata exactă
        const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
        videosUrl.searchParams.set("part", "contentDetails,snippet");
        videosUrl.searchParams.set("id", videoIds.join(","));
        videosUrl.searchParams.set("key", apiKey);

        const videosRes = await fetch(videosUrl.toString(), { next: { revalidate: 7200 } });
        const durationsMap = new Map<string, number>();

        if (videosRes.ok) {
            const videosData = (await videosRes.json()) as {
                items?: Array<{
                    id: string;
                    contentDetails?: { duration: string };
                }>;
            };
            for (const v of videosData.items || []) {
                if (v.contentDetails?.duration) {
                    durationsMap.set(v.id, parseIsoDuration(v.contentDetails.duration));
                }
            }
        }

        // 3. Mapare în TrackDto
        const tracks: TrackDto[] = items.map((item) => {
            const vid = item.id.videoId;
            const thumb =
                item.snippet.thumbnails?.high?.url ||
                item.snippet.thumbnails?.medium?.url ||
                item.snippet.thumbnails?.default?.url ||
                `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;

            const rawTitle = cleanHtmlEntities(item.snippet.title);
            const artistName = cleanHtmlEntities(item.snippet.channelTitle || "YouTube Artist");
            const durationMs = durationsMap.get(vid) ?? 210_000;

            return {
                id: `yt_${vid}`,
                slug: `yt-${vid}`,
                title: rawTitle,
                coverUrl: thumb,
                genre: "pop",
                durationMs,
                explicit: false,
                isPremium: false,
                priceUnits: null,
                locked: false,
                allowReels: false,
                audioTrackId: null,
                albumId: null,
                trackNumber: null,
                artist: {
                    id: item.snippet.channelId || `yt_channel_${vid}`,
                    slug: (item.snippet.channelTitle || "artist").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                    stageName: artistName,
                    bio: "",
                    avatarUrl: null,
                    coverUrl: null,
                    isOfficial: false,
                },
                plays7d: 0,
                liked: false,
                source: "youtube",
                youtubeVideoId: vid,
            };
        });

        // 4. Salvare în memorie și în baza de date PostgreSQL
        memoryCache.set(cacheKey, { tracks, expiresAt: Date.now() + CACHE_TTL_MS });
        void saveCachedTracksToDb(trimmed, tracks);

        return tracks;
    } catch (err) {
        console.error("[YouTube API] Error searching:", err);
        return FALLBACK_DEMO_TRACKS.slice(0, limit);
    }
}

/**
 * Caută o piesă individuală după Video ID sau slug `yt-...`.
 * Verifică fallback-urile, baza de date PostgreSQL și API-ul YouTube.
 */
export async function getYouTubeTrackByVideoId(videoId: string): Promise<TrackDto | null> {
    if (!videoId) return null;
    const cleanId = videoId.replace(/^yt[-_]/, "");

    // 1. Verificare piese demo / fallback
    for (const fb of FALLBACK_DEMO_TRACKS) {
        if (fb.youtubeVideoId === cleanId || fb.slug === `yt-${cleanId}`) {
            return fb;
        }
    }

    // 2. Verificare tabel youtube_tracks din baza de date
    try {
        const { dbQuery } = await import("@/lib/db");
        const { rows } = await dbQuery<{ video_id: string; title: string; channel: string; cover_url: string; duration_ms: number }>(
            "SELECT video_id, title, channel, cover_url, duration_ms FROM youtube_tracks WHERE video_id = $1",
            [cleanId]
        );
        if (rows[0]) {
            const r = rows[0];
            const channelSlug = (r.channel || "artist").toLowerCase().replace(/[^a-z0-9]+/g, "-");
            return {
                id: `yt_${r.video_id}`,
                slug: `yt-${r.video_id}`,
                title: r.title,
                coverUrl: r.cover_url,
                genre: "pop",
                durationMs: r.duration_ms || 210_000,
                explicit: false,
                isPremium: false,
                priceUnits: null,
                locked: false,
                allowReels: false,
                audioTrackId: null,
                albumId: null,
                trackNumber: null,
                artist: {
                    id: `yt_channel_${channelSlug}`,
                    slug: channelSlug,
                    stageName: r.channel,
                    bio: "",
                    avatarUrl: null,
                    coverUrl: null,
                    isOfficial: false,
                },
                plays7d: 0,
                liked: false,
                source: "youtube",
                youtubeVideoId: r.video_id,
            };
        }
    } catch {
        // DB fallback
    }

    // 3. YouTube API call direct dacă este configurat API key
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (apiKey) {
        try {
            const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
            videosUrl.searchParams.set("part", "snippet,contentDetails");
            videosUrl.searchParams.set("id", cleanId);
            videosUrl.searchParams.set("key", apiKey);

            const res = await fetch(videosUrl.toString(), { next: { revalidate: 86400 } });
            if (res.ok) {
                const data = (await res.json()) as {
                    items?: Array<{
                        id: string;
                        snippet?: {
                            title: string;
                            channelTitle: string;
                            channelId: string;
                            thumbnails?: {
                                high?: { url: string };
                                medium?: { url: string };
                            };
                        };
                        contentDetails?: { duration: string };
                    }>;
                };
                const item = data.items?.[0];
                if (item) {
                    const thumb =
                        item.snippet?.thumbnails?.high?.url ||
                        item.snippet?.thumbnails?.medium?.url ||
                        `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`;
                    const rawTitle = cleanHtmlEntities(item.snippet?.title || "");
                    const artistName = cleanHtmlEntities(item.snippet?.channelTitle || "Artist");
                    const durationMs = item.contentDetails?.duration
                        ? parseIsoDuration(item.contentDetails.duration)
                        : 210_000;
                    const channelSlug = (artistName || "artist").toLowerCase().replace(/[^a-z0-9]+/g, "-");

                    const track: TrackDto = {
                        id: `yt_${cleanId}`,
                        slug: `yt-${cleanId}`,
                        title: rawTitle,
                        coverUrl: thumb,
                        genre: "pop",
                        durationMs,
                        explicit: false,
                        isPremium: false,
                        priceUnits: null,
                        locked: false,
                        allowReels: false,
                        audioTrackId: null,
                        albumId: null,
                        trackNumber: null,
                        artist: {
                            id: item.snippet?.channelId || `yt_channel_${cleanId}`,
                            slug: channelSlug,
                            stageName: artistName,
                            bio: "",
                            avatarUrl: null,
                            coverUrl: null,
                            isOfficial: false,
                        },
                        plays7d: 0,
                        liked: false,
                        source: "youtube",
                        youtubeVideoId: cleanId,
                    };

                    try {
                        const { dbQuery } = await import("@/lib/db");
                        await dbQuery(
                            `INSERT INTO youtube_tracks (video_id, title, channel, cover_url, duration_ms)
                             VALUES ($1, $2, $3, $4, $5)
                             ON CONFLICT (video_id) DO NOTHING`,
                            [cleanId, rawTitle, artistName, thumb, durationMs]
                        ).catch(() => {});
                    } catch {}

                    return track;
                }
            }
        } catch (err) {
            console.error("[YouTube API] Error fetching single video:", err);
        }
    }

    return null;
}

