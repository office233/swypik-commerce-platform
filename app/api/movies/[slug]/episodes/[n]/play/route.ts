import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { withErrorHandling } from "@/lib/api-handler";
import { getSwypBalanceUnits } from "@/lib/swyp/ledger";
import { getSeriesBySlug, getEpisode, getEpisodeById, listEpisodes } from "@/lib/movies/repository";
import { buildViewerContext } from "@/lib/movies/viewer";
import { canPlay, isFreeEpisode } from "@/lib/movies/access";
import { seasonPriceUnits } from "@/lib/movies/pricing";
import { signStreamToken } from "@/lib/movies/stream-token";
import { MOVIES_STREAM_TOKEN_TTL_S } from "@/lib/movies/config";
import { getStreamSecret } from "@/lib/movies/stream-secret";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async function GET(_req: Request, { params }: { params: Promise<{ slug: string; n: string }> }) {
    if (!isEnabled("movies")) return frozenResponse("movies");
    const { slug, n } = await params;
    const episodeNumber = Number(n);
    if (!Number.isInteger(episodeNumber) || episodeNumber < 1) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const series = await getSeriesBySlug(slug);
    if (!series || series.status !== "published") return NextResponse.json({ error: "not_found" }, { status: 404 });
    const episode = await getEpisode(series.id, episodeNumber);
    if (!episode || episode.status !== "published") return NextResponse.json({ error: "not_found" }, { status: 404 });

    const user = await getAuthUser();
    const viewer = await buildViewerContext(user.userId, user.isAdmin, series.id);
    if (!canPlay(viewer, series, episode)) {
        const total = (await listEpisodes(series.id, { publishedOnly: true })).length;
        return NextResponse.json({
            error: "locked",
            priceUnits: series.episode_price_units,
            seasonPriceUnits: seasonPriceUnits(series, total),
            balanceUnits: user.userId ? Number(await getSwypBalanceUnits(user.userId)) : null,
            requireAuth: !user.userId,
        }, { status: 402 });
    }

    const full = await getEpisodeById(episode.id);
    if (!full?.playback_url) return NextResponse.json({ error: "not_ready" }, { status: 409 });

    // Episoadele gratuite: URL-ul public direct (identic cu feed-ul). Cele
    // blocate: doar prin proxy-ul cu token legat de user + episod, expirabil.
    if (isFreeEpisode(series, episode)) {
        return NextResponse.json({ videoId: full.video_id, playbackUrl: full.playback_url, poster: full.thumbnail_url, expiresAt: null });
    }
    const expiresAt = Date.now() + MOVIES_STREAM_TOKEN_TTL_S * 1000;
    const token = signStreamToken({ userId: user.userId ?? "admin", episodeId: episode.id, expiresAt }, getStreamSecret());
    return NextResponse.json({
        videoId: full.video_id,
        playbackUrl: `/api/movies/stream/${token}?p=${encodeURIComponent(full.playback_url)}`,
        poster: full.thumbnail_url,
        expiresAt,
    });
});
