/**
 * Client Audius REST API pentru Swypik Audio (Tab 2: Muzică & Beat-uri).
 * Accesează piese trending, căutare și stream direct MP3 fără restricții.
 * Suportă opțional AUDIUS_API_KEY / AUDIUS_BEARER_TOKEN din env.
 */

import type { AudioItemDto } from "./types";

interface AudiusTrack {
    id: string;
    title: string;
    user: {
        id: string;
        name: string;
        handle: string;
    };
    artwork?: {
        "480x480"?: string;
        "150x150"?: string;
    };
    duration: number; // secunde
    genre?: string;
    play_count?: number;
    description?: string;
}

interface AudiusResponse {
    data: AudiusTrack[];
}

const AUDIUS_FALLBACK_TRACKS: AudioItemDto[] = [
    {
        id: "audius_D7P28",
        slug: "midnight-city-remix",
        title: "Midnight City (VIP Remix)",
        artist: "Kavinsky Sound",
        coverUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
        streamUrl: "https://api.audius.co/v1/tracks/D7P28/stream?app_name=swypik",
        durationMs: 234000,
        genre: "Electronic / Synthwave",
        source: "audius",
        isLive: false,
    },
    {
        id: "audius_eYp12",
        slug: "tokyo-drift-trap",
        title: "Tokyo Drift (Trap Bass Boost)",
        artist: "Metro Beatmaker",
        coverUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80",
        streamUrl: "https://api.audius.co/v1/tracks/eYp12/stream?app_name=swypik",
        durationMs: 198000,
        genre: "Trap / Urban",
        source: "audius",
        isLive: false,
    },
    {
        id: "audius_qA987",
        slug: "lofi-rain-coffee",
        title: "Late Night Rain & Coffee",
        artist: "ChilledCow Vibes",
        coverUrl: "https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=600&auto=format&fit=crop&q=80",
        streamUrl: "https://api.audius.co/v1/tracks/qA987/stream?app_name=swypik",
        durationMs: 165000,
        genre: "Lo-Fi Beats",
        source: "audius",
        isLive: false,
    },
    {
        id: "audius_bK441",
        slug: "deep-house-sunset",
        title: "Ibiza Sunset Deep House",
        artist: "Oliver Club",
        coverUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80",
        streamUrl: "https://api.audius.co/v1/tracks/bK441/stream?app_name=swypik",
        durationMs: 275000,
        genre: "Deep House",
        source: "audius",
        isLive: false,
    },
];

let cachedTrending: { data: AudioItemDto[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 ore

function getHeaders(): HeadersInit {
    const token = process.env.AUDIUS_BEARER_TOKEN || process.env.AUDIUS_API_KEY;
    const headers: Record<string, string> = {
        Accept: "application/json",
        "User-Agent": "SwypikAudio/1.0",
    };
    if (token) {
        headers["Authorization"] = `Bearer ${token.trim()}`;
    }
    return headers;
}

export async function getAudiusTrendingTracks(limit = 25): Promise<AudioItemDto[]> {
    if (cachedTrending && cachedTrending.expiresAt > Date.now()) {
        return cachedTrending.data;
    }

    try {
        const url = `https://api.audius.co/v1/tracks/trending?app_name=swypik&limit=${limit}`;
        const res = await fetch(url, {
            headers: getHeaders(),
            next: { revalidate: 3600 },
        });

        if (!res.ok) {
            return AUDIUS_FALLBACK_TRACKS;
        }

        const json = (await res.json()) as AudiusResponse;
        if (!json.data || !Array.isArray(json.data) || json.data.length === 0) {
            return AUDIUS_FALLBACK_TRACKS;
        }

        const tracks: AudioItemDto[] = json.data.map((t) => {
            const artwork = t.artwork?.["480x480"] || t.artwork?.["150x150"] || null;
            const slug = (t.title || "track").toLowerCase().replace(/[^a-z0-9]+/g, "-");

            return {
                id: `audius_${t.id}`,
                slug: `audius-${t.id}-${slug}`.slice(0, 80),
                title: t.title.trim(),
                artist: t.user?.name || "Audius Producer",
                coverUrl: artwork,
                streamUrl: `https://api.audius.co/v1/tracks/${t.id}/stream?app_name=swypik`,
                durationMs: (t.duration || 180) * 1000,
                genre: t.genre || "Urban & Beats",
                source: "audius",
                isLive: false,
                externalUrl: `https://audius.co/${t.user?.handle}/${slug}`,
            };
        });

        cachedTrending = { data: tracks, expiresAt: Date.now() + CACHE_TTL_MS };
        return tracks;
    } catch {
        return AUDIUS_FALLBACK_TRACKS;
    }
}

export const getTrendingAudiusTracks = getAudiusTrendingTracks;


export async function searchAudiusTracks(query: string, limit = 20): Promise<AudioItemDto[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    try {
        const url = `https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(trimmed)}&app_name=swypik&limit=${limit}`;
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) return [];

        const json = (await res.json()) as AudiusResponse;
        if (!json.data || !Array.isArray(json.data)) return [];

        return json.data.map((t) => {
            const artwork = t.artwork?.["480x480"] || t.artwork?.["150x150"] || null;
            const slug = (t.title || "track").toLowerCase().replace(/[^a-z0-9]+/g, "-");

            return {
                id: `audius_${t.id}`,
                slug: `audius-${t.id}-${slug}`.slice(0, 80),
                title: t.title.trim(),
                artist: t.user?.name || "Audius Producer",
                coverUrl: artwork,
                streamUrl: `https://api.audius.co/v1/tracks/${t.id}/stream?app_name=swypik`,
                durationMs: (t.duration || 180) * 1000,
                genre: t.genre || "Beats",
                source: "audius",
                isLive: false,
            };
        });
    } catch {
        return [];
    }
}
