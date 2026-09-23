import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { withErrorHandling } from "@/lib/api-handler";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { MUSIC_HOME_ROW_MAX } from "@/lib/music/config";
import { listTracks, ensureLikedPlaylist, listPlaylistTracks, listPlaylists, getLikedTrackIds } from "@/lib/music/repository";
import { toTrackDto } from "@/lib/music/dto";
import { buildMusicViewer } from "@/lib/music/viewer";
import { buildMusicHomeRows } from "@/lib/music/home";
import { getCuratedRomanianRadios } from "@/lib/audio/radio-browser";
import { getTrendingAudiusTracks } from "@/lib/audio/audius";
import { getChillJamendoTracks } from "@/lib/audio/jamendo";
import { audioItemToTrackDto } from "@/lib/audio/types";
import type { TrackDto } from "@/lib/music/types";

export const dynamic = "force-dynamic";

const TRENDING_POOL = 60;

/** Tot ce are nevoie pagina /music într-o singură cerere: featured + rânduri. */
export const GET = withErrorHandling(async function GET(req: Request) {
    if (!isEnabled("music")) return frozenResponse("music");
    const rl = await rateLimit("musicCatalog", getClientIP(req));
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const user = await getAuthUser();
    const viewer = await buildMusicViewer(user.userId, user.isAdmin);

    let trending: TrackDto[] = [];
    let latest: TrackDto[] = [];
    let liked: TrackDto[] = [];
    let playlists: { id: string; title: string; trackCount: number }[] = [];

    try {
        const [trendingRows, latestRows, likedRows, playlistRows] = await Promise.all([
            listTracks({ sort: "trending", limit: TRENDING_POOL, offset: 0 }),
            listTracks({ sort: "new", limit: MUSIC_HOME_ROW_MAX, offset: 0 }),
            user.userId ? ensureLikedPlaylist(user.userId).then((id) => listPlaylistTracks(id)) : Promise.resolve([]),
            user.userId ? listPlaylists(user.userId) : Promise.resolve([]),
        ]);

        const allIds = [...trendingRows, ...latestRows, ...likedRows].map((t) => t.id);
        const likedIds = user.userId ? await getLikedTrackIds(user.userId, allIds) : new Set<string>();

        trending = trendingRows.map((t) => toTrackDto(t, viewer, likedIds.has(t.id)));
        latest = latestRows.map((t) => toTrackDto(t, viewer, likedIds.has(t.id)));
        liked = likedRows.map((t) => toTrackDto(t, viewer, likedIds.has(t.id)));
        playlists = playlistRows.filter((p) => !p.is_liked_list).map((p) => ({ id: p.id, title: p.title, trackCount: p.track_count }));
    } catch {
        // Dacă baza de date locală e offline sau goală, fallback fluent
    }

    // Swypik Audio: alimentăm automat cu Radio Live România și Audius
    if (trending.length === 0) {
        try {
            const [roRadios, audiusTracks] = await Promise.all([
                getCuratedRomanianRadios(),
                getTrendingAudiusTracks(10),
            ]);
            const audioItems = [...roRadios, ...audiusTracks].map(audioItemToTrackDto);
            if (audioItems.length > 0) {
                trending = audioItems;
            }
        } catch {
            // continue
        }
    }

    if (latest.length === 0) {
        try {
            const jamendoTracks = await getChillJamendoTracks(10);
            latest = jamendoTracks.map(audioItemToTrackDto);
        } catch {
            // continue
        }
    }

    const rows = buildMusicHomeRows({
        top: trending,
        latest,
        liked,
        playlists,
    });

    return NextResponse.json({ featured: trending[0] ?? null, rows });
});
