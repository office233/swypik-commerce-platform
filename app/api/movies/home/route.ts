import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { withErrorHandling } from "@/lib/api-handler";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { listPublishedSeries, listContinueWatching, listWatchlist } from "@/lib/movies/repository";
import { toSeriesDto } from "@/lib/movies/dto";
import { buildHomeRows, HOME_ROW_MAX } from "@/lib/movies/home";
import { getTrendingMovies } from "@/lib/movies/tmdb";
import type { SeriesDto } from "@/lib/movies/types";

export const dynamic = "force-dynamic";

const TRENDING_POOL = 60;
const CONTINUE_LIMIT = 10;

/** Tot ce are nevoie pagina /movies într-o singură cerere: featured + rânduri. */
export const GET = withErrorHandling(async function GET(req: Request) {
    if (!isEnabled("movies")) return frozenResponse("movies");
    const rl = await rateLimit("moviesCatalog", getClientIP(req));
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const user = await getAuthUser();
    const includeAdult = user.isAdmin;
    const [trendingRows, latestRows, continueRows, watchlistRows] = await Promise.all([
        listPublishedSeries({ sort: "trending", limit: TRENDING_POOL, offset: 0, includeAdult }),
        listPublishedSeries({ sort: "new", limit: HOME_ROW_MAX, offset: 0, includeAdult }),
        user.userId ? listContinueWatching(user.userId, CONTINUE_LIMIT) : Promise.resolve([]),
        user.userId ? listWatchlist(user.userId, HOME_ROW_MAX) : Promise.resolve([]),
    ]);

    let trending = trendingRows.map((s) => toSeriesDto(s, s.episode_count, s.owner_name));

    // Catalog Cinema 4K TMDB
    const tmdbMovies = await getTrendingMovies();
    const tmdbSeries: SeriesDto[] = tmdbMovies.map((m) => ({
        id: m.id,
        slug: m.id,
        title: m.title,
        synopsis: m.overview,
        genres: m.genres,
        coverUrl: m.backdropUrl,
        posterUrl: m.posterUrl,
        trailerVideoId: m.trailerYoutubeKey || null,
        freeEpisodes: 1,
        episodePriceUnits: 0,
        seasonPriceUnits: 0,
        seasonDiscountPct: 0,
        isAdult: false,
        episodeCount: 1,
        owner: { id: "swypik-cinema", name: "Cinema 4K", isOfficial: true },
    }));

    if (trending.length === 0) {
        trending = tmdbSeries;
    } else {
        trending = [...trending, ...tmdbSeries];
    }

    const rows = buildHomeRows({
        trending,
        latest: latestRows.map((s) => toSeriesDto(s, s.episode_count, s.owner_name)),
        continueWatching: continueRows.map((c) => ({
            series: toSeriesDto(c.series, 0, null),
            episodeNumber: c.episode.episode_number,
            positionMs: c.position_ms,
            durationMs: c.episode.duration_ms,
        })),
        watchlist: watchlistRows.map((s) => toSeriesDto(s, s.episode_count, s.owner_name)),
    });

    return NextResponse.json({ featured: trending[0] ?? null, rows });
});
