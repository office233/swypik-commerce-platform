import { SWYPIK_OFFICIAL_ID } from "@/lib/config/accounts";
import { canPlay } from "./access";
import { seasonPriceUnits } from "./pricing";
import { MOVIES_SEASON_DISCOUNT_PCT } from "./config";
import type { EpisodeDto, MovieEpisodeWithThumb, MovieProgressRow, MovieSeriesRow, SeriesDto, ViewerContext } from "./types";

export function toSeriesDto(series: MovieSeriesRow, episodeCount: number, ownerName: string | null): SeriesDto {
    return {
        id: series.id,
        slug: series.slug,
        title: series.title,
        synopsis: series.synopsis,
        genres: series.genres,
        coverUrl: series.cover_url,
        posterUrl: series.poster_url,
        trailerVideoId: series.trailer_video_id,
        freeEpisodes: series.free_episodes,
        episodePriceUnits: series.episode_price_units,
        seasonPriceUnits: seasonPriceUnits(series, episodeCount),
        seasonDiscountPct: MOVIES_SEASON_DISCOUNT_PCT,
        isAdult: series.is_adult,
        episodeCount,
        owner: { id: series.owner_user_id, name: ownerName ?? "Swypik", isOfficial: series.owner_user_id === SWYPIK_OFFICIAL_ID },
    };
}

export function toEpisodeDtos(series: MovieSeriesRow, episodes: MovieEpisodeWithThumb[], viewer: ViewerContext, progress: MovieProgressRow[]): EpisodeDto[] {
    const byEpisode = new Map(progress.map((p) => [p.episode_id, p]));
    return episodes.map((e) => {
        const p = byEpisode.get(e.id);
        return {
            id: e.id,
            number: e.episode_number,
            title: e.title,
            durationMs: e.duration_ms,
            thumbnailUrl: e.thumbnail_url,
            locked: !canPlay(viewer, series, e),
            priceUnits: series.episode_price_units,
            progress: p ? { positionMs: p.position_ms, completed: p.completed } : null,
        };
    });
}
