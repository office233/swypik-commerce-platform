import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { withErrorHandling } from "@/lib/api-handler";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { MUSIC_CATALOG_PAGE_SIZE } from "@/lib/music/config";
import { MUSIC_GENRES } from "@/lib/music/genres";
import { listTracks, getLikedTrackIds } from "@/lib/music/repository";
import { toTrackDto } from "@/lib/music/dto";
import { buildMusicViewer } from "@/lib/music/viewer";

import { searchYouTubeMusic } from "@/lib/music/youtube";

export const dynamic = "force-dynamic";

const GENRE_QUERIES: Record<string, string> = {
    pop: "pop music top hits",
    hiphop: "hip hop hits top",
    trap: "trap music hits",
    manele: "manele noi top",
    rock: "rock music hits classic",
    electronic: "electronic dance music hits",
    rnb: "r&b soul hits",
    latino: "latino music top hits",
    folk: "folk acoustic music",
    kids: "canticele copii muzica",
};

const QuerySchema = z.object({
    genre: z.enum(MUSIC_GENRES).optional(),
    sort: z.enum(["trending", "new"]).default("trending"),
    q: z.string().trim().max(80).optional(),
    offset: z.coerce.number().int().min(0).default(0),
});

export const GET = withErrorHandling(async function GET(req: Request) {
    if (!isEnabled("music")) return frozenResponse("music");
    const rl = await rateLimit("musicCatalog", getClientIP(req));
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });
    const { genre, sort, q, offset } = parsed.data;

    let items: Awaited<ReturnType<typeof listTracks>> = [];
    let likedIds = new Set<string>();

    try {
        const user = await getAuthUser();
        const viewer = await buildMusicViewer(user.userId, user.isAdmin);
        items = await listTracks({ genre, sort, q, limit: MUSIC_CATALOG_PAGE_SIZE, offset });
        if (user.userId && items.length > 0) {
            likedIds = await getLikedTrackIds(user.userId, items.map((t) => t.id)).catch(() => new Set<string>());
        }

        if (items.length > 0) {
            return NextResponse.json({ items: items.map((t) => toTrackDto(t, viewer, likedIds.has(t.id))) });
        }
    } catch {
        // Fallback dacă DB local e gol sau indisponibil
    }

    // Fallback automat pe genuri sau căutare
    if (offset === 0 && genre) {
        const query = GENRE_QUERIES[genre] || `${genre} music hits`;
        const ytTracks = await searchYouTubeMusic(query, 20).catch(() => []);
        if (ytTracks.length > 0) {
            return NextResponse.json({
                items: ytTracks.map((tr) => ({ ...tr, genre })),
            });
        }
    }

    if (offset === 0 && q) {
        const ytTracks = await searchYouTubeMusic(q, 20).catch(() => []);
        if (ytTracks.length > 0) {
            return NextResponse.json({ items: ytTracks });
        }
    }

    return NextResponse.json({ items: [] });
});
