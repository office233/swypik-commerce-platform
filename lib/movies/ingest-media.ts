/**
 * Importul unui fișier video licențiat ca episod: aceeași cale ca uploadurile
 * creatorilor (videos → video_assets → job de transcodare HLS), apoi rândul
 * `movie_episodes`. Episodul rămâne privat cât timp titlul nu e publicat
 * (syncEpisodeVisibility + trigger-ul DB), iar publicarea cere ca videoul să
 * fie gata și aprobat la moderare.
 */
import { SWYPIK_OFFICIAL_ID } from "@/lib/config/accounts";
import { enqueueVideoPipeline } from "@/lib/video/pipeline";
import { addEpisode } from "./repository";
import type { MovieEpisodeRow, MovieSeriesRow } from "./types";

export async function importEpisodeFromUrl(args: {
    series: Pick<MovieSeriesRow, "id" | "title" | "license_type" | "license_source_url">;
    episodeNumber: number;
    title: string;
    mediaUrl: string;
}): Promise<{ episode: MovieEpisodeRow; videoId: string; queued: boolean }> {
    const job = await enqueueVideoPipeline({
        sourceUrl: args.mediaUrl,
        title: args.title,
        creatorId: SWYPIK_OFFICIAL_ID,
        tags: ["movies"],
        metadata: {
            vertical: "movies",
            seriesId: args.series.id,
            license: args.series.license_type,
            license_source_url: args.series.license_source_url,
        },
    });
    const episode = await addEpisode({
        seriesId: args.series.id,
        episodeNumber: args.episodeNumber,
        videoId: job.videoId,
        title: args.title,
        durationMs: null,
    });
    return { episode, videoId: job.videoId, queued: job.queued };
}
