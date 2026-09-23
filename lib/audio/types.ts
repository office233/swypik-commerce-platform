/**
 * Tipuri de date unificate pentru Swypik Audio.
 * Acoperă: Radio Live, Audius (Muzică urbană/electro), Jamendo (Chill/Indie) și Podcasturi.
 */

export type AudioSourceType = "radio" | "audius" | "jamendo" | "podcast" | "swypik";

export interface AudioItemDto {
    id: string;
    slug: string;
    title: string;
    artist: string;
    coverUrl: string | null;
    streamUrl: string;
    durationMs: number; // 0 pentru Radio Live
    genre: string;
    source: AudioSourceType;
    isLive?: boolean;
    bitrateKbps?: number;
    stationCountry?: string;
    stationVotes?: number;
    externalUrl?: string;
}

export interface AudioFeedSection {
    id: string;
    title: string;
    subtitle?: string;
    source: AudioSourceType;
    items: AudioItemDto[];
}

export interface AudioFeedResponse {
    sections: AudioFeedSection[];
}

import type { TrackDto } from "@/lib/music/types";

export function audioItemToTrackDto(item: AudioItemDto): TrackDto {
    return {
        id: item.id,
        slug: item.slug,
        title: item.title,
        coverUrl: item.coverUrl,
        genre: item.genre,
        durationMs: item.durationMs,
        explicit: false,
        isPremium: false,
        priceUnits: null,
        locked: false,
        allowReels: false,
        audioTrackId: null,
        albumId: null,
        trackNumber: null,
        artist: {
            id: `artist-${item.source}-${item.artist.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
            slug: item.artist.toLowerCase().replace(/[^a-z0-9]/g, "-"),
            stageName: item.artist,
            bio: item.isLive ? `Post de radio live (${item.stationCountry || "RO"})` : `Artist ${item.source}`,
            avatarUrl: item.coverUrl,
            coverUrl: item.coverUrl,
            isOfficial: item.source === "radio",
        },
        plays7d: 100,
        liked: false,
        source: item.source,
        streamUrl: item.streamUrl,
        isLive: item.isLive,
    };
}
