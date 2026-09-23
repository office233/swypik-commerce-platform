/**
 * Client Radio Browser API pentru Swypik Audio (Tab 1: Radio Live).
 * Interoghează serverele Radio Browser pentru posturile din România și globale.
 * Include fallback cu stream-urile oficiale verificate pentru radiourile naționale de top.
 */

import type { AudioItemDto } from "./types";

const RADIO_SERVERS = [
    "https://de1.api.radio-browser.info",
    "https://nl1.api.radio-browser.info",
    "https://at1.api.radio-browser.info",
];

// Fallback verificat cu stream-urile directe oficiale ale radiourilor din România
export const CURATED_ROMANIAN_STATIONS: AudioItemDto[] = [
    {
        id: "radio_kissfm_ro",
        slug: "kiss-fm-romania",
        title: "Kiss FM",
        artist: "Radio Live România",
        coverUrl: "",
        streamUrl: "https://live.kissfm.ro/kissfm.aacp",
        durationMs: 0,
        genre: "Pop & Top 40",
        source: "radio",
        isLive: true,
        stationCountry: "România",
        stationVotes: 9500,
    },
    {
        id: "radio_zu_ro",
        slug: "radio-zu",
        title: "Radio ZU",
        artist: "Radio Live România",
        coverUrl: "",
        streamUrl: "https://stream.radiozu.ro:8020/live.aac",
        durationMs: 0,
        genre: "Pop & Hituri",
        source: "radio",
        isLive: true,
        stationCountry: "România",
        stationVotes: 9200,
    },
    {
        id: "radio_europafm_ro",
        slug: "europa-fm-romania",
        title: "Europa FM",
        artist: "Radio Live România",
        coverUrl: "",
        streamUrl: "https://astreaming.europafm.ro:8000/EuropaFM_aac",
        durationMs: 0,
        genre: "Știri & Pop",
        source: "radio",
        isLive: true,
        stationCountry: "România",
        stationVotes: 8700,
    },
    {
        id: "radio_rockfm_ro",
        slug: "rock-fm-romania",
        title: "Rock FM",
        artist: "Radio Live România",
        coverUrl: "",
        streamUrl: "https://live.rockfm.ro/rockfm.aacp",
        durationMs: 0,
        genre: "Rock Clasic & Modern",
        source: "radio",
        isLive: true,
        stationCountry: "România",
        stationVotes: 8900,
    },
    {
        id: "radio_magicfm_ro",
        slug: "magic-fm-romania",
        title: "Magic FM",
        artist: "Radio Live România",
        coverUrl: "",
        streamUrl: "https://live.magicfm.ro/magicfm.aacp",
        durationMs: 0,
        genre: "Soft Rock & Clasic",
        source: "radio",
        isLive: true,
        stationCountry: "România",
        stationVotes: 7800,
    },
    {
        id: "radio_digifm_ro",
        slug: "digi-fm-romania",
        title: "Digi FM",
        artist: "Radio Live România",
        coverUrl: "",
        streamUrl: "https://edge126.rdsnet.ro:8443/digifm/digifm.mp3",
        durationMs: 0,
        genre: "Știri & Hituri",
        source: "radio",
        isLive: true,
        stationCountry: "România",
        stationVotes: 7600,
    },
    {
        id: "radio_virgin_ro",
        slug: "virgin-radio-romania",
        title: "Virgin Radio",
        artist: "Radio Live România",
        coverUrl: "",
        streamUrl: "https://astreaming.virginradio.ro:8000/virgin_aacp",
        durationMs: 0,
        genre: "Hip-Hop & Urban",
        source: "radio",
        isLive: true,
        stationCountry: "România",
        stationVotes: 7400,
    },
    {
        id: "radio_profm_ro",
        slug: "pro-fm-romania",
        title: "PRO FM",
        artist: "Radio Live România",
        coverUrl: "",
        streamUrl: "https://edge126.rdsnet.ro:8443/profm/profm.mp3",
        durationMs: 0,
        genre: "Dance & Club",
        source: "radio",
        isLive: true,
        stationCountry: "România",
        stationVotes: 7100,
    },
    {
        id: "radio_guerrilla_ro",
        slug: "radio-guerrilla",
        title: "Radio Guerrilla",
        artist: "Radio Live România",
        coverUrl: "",
        streamUrl: "https://stream.eliberadio.ro:8000/guerrilla.aac",
        durationMs: 0,
        genre: "Alternative & Indie",
        source: "radio",
        isLive: true,
        stationCountry: "România",
        stationVotes: 6900,
    },
    {
        id: "radio_dancefm_ro",
        slug: "dance-fm-romania",
        title: "Dance FM",
        artist: "Radio Live România",
        coverUrl: "",
        streamUrl: "https://edge126.rdsnet.ro:8443/dancefm/dancefm.mp3",
        durationMs: 0,
        genre: "Electronic & House",
        source: "radio",
        isLive: true,
        stationCountry: "România",
        stationVotes: 6800,
    },
];

interface RawRadioStation {
    stationuuid: string;
    name: string;
    url_resolved: string;
    favicon?: string;
    tags?: string;
    country?: string;
    votes?: number;
    codec?: string;
    bitrate?: number;
    lastcheckok?: number;
}

let cachedStations: { data: AudioItemDto[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 ore

export async function getLiveRadioStations(country = "romania", limit = 40): Promise<AudioItemDto[]> {
    if (cachedStations && cachedStations.expiresAt > Date.now()) {
        return cachedStations.data;
    }

    for (const server of RADIO_SERVERS) {
        try {
            const url = `${server}/json/stations/bycountry/${encodeURIComponent(country)}?order=votes&reverse=true&limit=${limit}`;
            const res = await fetch(url, {
                headers: { "User-Agent": "SwypikAudio/1.0" },
                next: { revalidate: 3600 },
            });

            if (!res.ok) continue;

            const stations = (await res.json()) as RawRadioStation[];
            if (!Array.isArray(stations) || stations.length === 0) continue;

            // Filtrare: doar stream-uri active (lastcheckok === 1) cu URL valid
            const activeStations = stations
                .filter((s) => s.lastcheckok === 1 && s.url_resolved && s.name)
                .map((s): AudioItemDto => {
                    const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
                    // Folosește fallback cover dacă favicon lipsește
                    const cover =
                        s.favicon && s.favicon.startsWith("http")
                            ? s.favicon
                            : CURATED_ROMANIAN_STATIONS.find((c) => c.title.toLowerCase() === s.name.toLowerCase())?.coverUrl ||
                              null;

                    return {
                        id: `radio_${s.stationuuid}`,
                        slug,
                        title: s.name.trim(),
                        artist: "Radio Live România",
                        coverUrl: cover,
                        streamUrl: s.url_resolved,
                        durationMs: 0,
                        genre: s.tags?.split(",")?.[0]?.trim() || "Radio",
                        source: "radio",
                        isLive: true,
                        bitrateKbps: s.bitrate || 128,
                        stationCountry: s.country || "România",
                        stationVotes: s.votes || 0,
                    };
                });

            // Combină radiourile curatoriate în față
            const curatedIds = new Set(CURATED_ROMANIAN_STATIONS.map((c) => c.title.toLowerCase()));
            const uniqueApiStations = activeStations.filter((s) => !curatedIds.has(s.title.toLowerCase()));
            const combined = [...CURATED_ROMANIAN_STATIONS, ...uniqueApiStations];

            cachedStations = { data: combined, expiresAt: Date.now() + CACHE_TTL_MS };
            return combined;
        } catch {
            // Continuă la următorul server mirror
        }
    }

    // Fallback garantat dacă niciun server Radio Browser nu răspunde
    return CURATED_ROMANIAN_STATIONS;
}

export async function getCuratedRomanianRadios(): Promise<AudioItemDto[]> {
    return getLiveRadioStations("romania", 40);
}

export async function getTopGlobalRadios(limit = 12): Promise<AudioItemDto[]> {
    for (const server of RADIO_SERVERS) {
        try {
            const url = `${server}/json/stations/topclick/${limit}`;
            const res = await fetch(url, {
                headers: { "User-Agent": "SwypikAudio/1.0" },
                next: { revalidate: 3600 },
            });
            if (!res.ok) continue;
            const stations = (await res.json()) as RawRadioStation[];
            if (!Array.isArray(stations) || stations.length === 0) continue;
            return stations
                .filter((s) => s.lastcheckok === 1 && s.url_resolved && s.name)
                .map((s): AudioItemDto => ({
                    id: `radio_${s.stationuuid}`,
                    slug: s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                    title: s.name.trim(),
                    artist: s.country || "Global Radio",
                    coverUrl: s.favicon && s.favicon.startsWith("http") ? s.favicon : null,
                    streamUrl: s.url_resolved,
                    durationMs: 0,
                    genre: s.tags?.split(",")?.[0]?.trim() || "Hits",
                    source: "radio",
                    isLive: true,
                    bitrateKbps: s.bitrate || 128,
                    stationCountry: s.country || "Global",
                    stationVotes: s.votes || 0,
                }));
        } catch {
            // continue
        }
    }
    return [];
}

export async function searchRadioStations(query: string, limit = 10): Promise<AudioItemDto[]> {
    if (!query.trim()) return [];
    for (const server of RADIO_SERVERS) {
        try {
            const url = `${server}/json/stations/byname/${encodeURIComponent(query.trim())}?limit=${limit}`;
            const res = await fetch(url, {
                headers: { "User-Agent": "SwypikAudio/1.0" },
            });
            if (!res.ok) continue;
            const stations = (await res.json()) as RawRadioStation[];
            if (!Array.isArray(stations) || stations.length === 0) continue;
            return stations
                .filter((s) => s.url_resolved && s.name)
                .map((s): AudioItemDto => ({
                    id: `radio_${s.stationuuid}`,
                    slug: s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                    title: s.name.trim(),
                    artist: s.country || "Radio Live",
                    coverUrl: s.favicon && s.favicon.startsWith("http") ? s.favicon : null,
                    streamUrl: s.url_resolved,
                    durationMs: 0,
                    genre: s.tags?.split(",")?.[0]?.trim() || "Radio",
                    source: "radio",
                    isLive: true,
                    bitrateKbps: s.bitrate || 128,
                    stationCountry: s.country || "Live",
                    stationVotes: s.votes || 0,
                }));
        } catch {
            // continue
        }
    }
    return [];
}

