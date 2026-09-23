/**
 * Client Jamendo v3 API pentru Swypik Audio (Tab 3: Chill, Indie & Lounge).
 * Prelucrează piese licențiate liber (Creative Commons) pentru relaxare, lucru și studiu.
 */

import type { AudioItemDto } from "./types";

interface JamendoTrack {
    id: string;
    name: string;
    duration: number; // secunde
    artist_name: string;
    album_name?: string;
    image?: string;
    audio?: string; // direct MP3 URL
    audiodownload?: string;
}

interface JamendoResponse {
    results: JamendoTrack[];
}

const DEFAULT_JAMENDO_CLIENT_ID = "56d30c95"; // Jamendo public client ID

const JAMENDO_FALLBACK_TRACKS: AudioItemDto[] = [
    {
        id: "jamendo_1892831",
        slug: "autumn-breeze-acoustic",
        title: "Autumn Breeze",
        artist: "Acoustic Morning",
        coverUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&auto=format&fit=crop&q=80",
        streamUrl: "https://prod-1.storage.jamendo.com/download/track/1892831/mp32/",
        durationMs: 215000,
        genre: "Acoustic & Chill",
        source: "jamendo",
        isLive: false,
    },
    {
        id: "jamendo_1749281",
        slug: "piano-memories-relax",
        title: "Memories in the Rain",
        artist: "Serene Piano Duo",
        coverUrl: "https://images.unsplash.com/photo-1520523839898-507127053c37?w=600&auto=format&fit=crop&q=80",
        streamUrl: "https://prod-1.storage.jamendo.com/download/track/1749281/mp32/",
        durationMs: 195000,
        genre: "Piano & Ambient",
        source: "jamendo",
        isLive: false,
    },
    {
        id: "jamendo_1623910",
        slug: "coffee-shop-jazz",
        title: "Sunday Morning Coffee",
        artist: "Smooth Jazz Collective",
        coverUrl: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=600&auto=format&fit=crop&q=80",
        streamUrl: "https://prod-1.storage.jamendo.com/download/track/1623910/mp32/",
        durationMs: 240000,
        genre: "Lounge & Jazz",
        source: "jamendo",
        isLive: false,
    },
    {
        id: "jamendo_1582910",
        slug: "deep-focus-study",
        title: "Deep Space Focus",
        artist: "Nordic Soundscapes",
        coverUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&auto=format&fit=crop&q=80",
        streamUrl: "https://prod-1.storage.jamendo.com/download/track/1582910/mp32/",
        durationMs: 310000,
        genre: "Ambient & Study",
        source: "jamendo",
        isLive: false,
    },
];

let cachedChill: { data: AudioItemDto[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 ore

export async function getJamendoChillTracks(tags = "chillout+lounge+acoustic", limit = 25): Promise<AudioItemDto[]> {
    if (cachedChill && cachedChill.expiresAt > Date.now()) {
        return cachedChill.data;
    }

    const clientId = process.env.JAMENDO_CLIENT_ID || DEFAULT_JAMENDO_CLIENT_ID;

    try {
        const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${clientId}&format=json&limit=${limit}&tags=${tags}&audioformat=mp32&featured=1`;
        const res = await fetch(url, {
            headers: { "User-Agent": "SwypikAudio/1.0" },
            next: { revalidate: 7200 },
        });

        if (!res.ok) {
            return JAMENDO_FALLBACK_TRACKS;
        }

        const json = (await res.json()) as JamendoResponse;
        if (!json.results || !Array.isArray(json.results) || json.results.length === 0) {
            return JAMENDO_FALLBACK_TRACKS;
        }

        const tracks: AudioItemDto[] = json.results
            .filter((t) => t.audio || t.audiodownload)
            .map((t) => {
                const slug = (t.name || "track").toLowerCase().replace(/[^a-z0-9]+/g, "-");
                return {
                    id: `jamendo_${t.id}`,
                    slug: `jamendo-${t.id}-${slug}`.slice(0, 80),
                    title: t.name.trim(),
                    artist: t.artist_name || "Indie Artist",
                    coverUrl: t.image || null,
                    streamUrl: t.audio || t.audiodownload || "",
                    durationMs: (t.duration || 200) * 1000,
                    genre: "Chill & Lounge",
                    source: "jamendo",
                    isLive: false,
                };
            });

        cachedChill = { data: tracks, expiresAt: Date.now() + CACHE_TTL_MS };
        return tracks;
    } catch {
        return JAMENDO_FALLBACK_TRACKS;
    }
}

export async function getChillJamendoTracks(limit = 15): Promise<AudioItemDto[]> {
    return getJamendoChillTracks("chillout+lounge+ambient", limit);
}

export async function searchJamendoTracks(query: string, limit = 10): Promise<AudioItemDto[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const clientId = process.env.JAMENDO_CLIENT_ID || DEFAULT_JAMENDO_CLIENT_ID;

    try {
        const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${clientId}&format=json&limit=${limit}&namesearch=${encodeURIComponent(trimmed)}&audioformat=mp32`;
        const res = await fetch(url, {
            headers: { "User-Agent": "SwypikAudio/1.0" },
        });

        if (!res.ok) return [];
        const json = (await res.json()) as JamendoResponse;
        if (!json.results || !Array.isArray(json.results)) return [];

        return json.results
            .filter((t) => t.audio || t.audiodownload)
            .map((t) => {
                const slug = (t.name || "track").toLowerCase().replace(/[^a-z0-9]+/g, "-");
                return {
                    id: `jamendo_${t.id}`,
                    slug: `jamendo-${t.id}-${slug}`.slice(0, 80),
                    title: t.name.trim(),
                    artist: t.artist_name || "Indie Artist",
                    coverUrl: t.image || null,
                    streamUrl: t.audio || t.audiodownload || "",
                    durationMs: (t.duration || 200) * 1000,
                    genre: "Indie / Creative Commons",
                    source: "jamendo",
                    isLive: false,
                };
            });
    } catch {
        return [];
    }
}

