import type { TxQuery } from "@/lib/db";
import { isFreeEpisode } from "./access";
import type { MovieEpisodeRow, MovieSeriesRow } from "./types";

/**
 * Un episod blocat NU are voie să fie `public` în `videos`: feed-ul, căutarea și
 * pagina /v/[id] filtrează pe visibility='public', deci `private` este ceea ce
 * ține episoadele plătite în afara oricărei suprafețe, în afară de player-ul
 * Movies (care citește playback_url server-side, după verificarea accesului).
 */
export function targetVisibility(
    series: Pick<MovieSeriesRow, "free_episodes" | "status">,
    episode: Pick<MovieEpisodeRow, "episode_number" | "status">,
): "public" | "private" {
    if (series.status !== "published" || episode.status !== "published") return "private";
    return isFreeEpisode(series, episode) ? "public" : "private";
}

/** Aliniază `videos.visibility` pentru toate episoadele unui serial (în tranzacția apelantului). */
export async function syncEpisodeVisibility(q: TxQuery, seriesId: string): Promise<{ made_public: number; made_private: number }> {
    const { rows } = await q<{ free_episodes: number; status: MovieSeriesRow["status"] }>(
        `SELECT free_episodes, status FROM movie_series WHERE id = $1 FOR UPDATE`,
        [seriesId],
    );
    const series = rows[0];
    if (!series) return { made_public: 0, made_private: 0 };

    const { rows: episodes } = await q<Pick<MovieEpisodeRow, "video_id" | "episode_number" | "status">>(
        `SELECT video_id, episode_number, status FROM movie_episodes WHERE series_id = $1`,
        [seriesId],
    );
    const publicIds = episodes.filter((e) => targetVisibility(series, e) === "public").map((e) => e.video_id);
    const privateIds = episodes.filter((e) => targetVisibility(series, e) === "private").map((e) => e.video_id);

    const pub = publicIds.length
        ? await q(`UPDATE videos SET visibility = 'public', updated_at = now() WHERE id = ANY($1::uuid[]) AND visibility <> 'public'`, [publicIds])
        : { rowCount: 0 };
    const priv = privateIds.length
        ? await q(`UPDATE videos SET visibility = 'private', updated_at = now() WHERE id = ANY($1::uuid[]) AND visibility <> 'private'`, [privateIds])
        : { rowCount: 0 };
    return { made_public: pub.rowCount, made_private: priv.rowCount };
}
