/**
 * Client TMDB (The Movie Database) pentru rândul onest „Trailere populare”.
 * Activ DOAR când TMDB_API_KEY este setat — fără cheie, fără rând, fără date
 * simulate. Titlurile TMDB nu sunt niciodată tratate ca seriale Swypik: au un
 * DTO separat (`TrailerItem`) și apar exclusiv în acest rând dedicat, cu
 * atribuire TMDB vizibilă. Vezi lib/movies/home.ts pentru compunerea rândului.
 */
import { logger } from "@/lib/logger";
import { MOVIE_GENRES, type MovieGenre } from "./genres";

/** Trailer TMDB — niciodată confundat cu un SeriesDto (nu are episoade, preț sau owner). */
export interface TrailerItem {
    id: string;
    tmdbId: number;
    title: string;
    originalTitle: string;
    overview: string;
    posterUrl: string | null;
    backdropUrl: string | null;
    /** Nota TMDB brută (0-10), afișată etichetat „TMDB” în UI — niciodată ca rating propriu Swypik. */
    voteAverage: number;
    releaseYear: string;
    genres: MovieGenre[];
    youtubeKey: string;
}

const TMDB_API_BASE = "https://api.themoviedb.org/3";
const TMDB_FETCH_TIMEOUT_MS = 5000;
const TMDB_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const TMDB_MAX_ITEMS = 15;

/** Mapare oficială TMDB genre_ids → taxonomia noastră fixă (lib/movies/genres.ts). Genurile TMDB fără corespondent sunt ignorate. */
const TMDB_GENRE_MAP: Record<number, MovieGenre> = {
    18: "drama",
    10749: "romance",
    35: "comedy",
    53: "thriller",
    28: "action",
    14: "fantasy",
    80: "crime",
    9648: "mystery",
    10751: "family",
};

function mapTmdbGenreIds(genreIds: unknown): MovieGenre[] {
    if (!Array.isArray(genreIds)) return [];
    const out: MovieGenre[] = [];
    for (const id of genreIds) {
        const genre = typeof id === "number" ? TMDB_GENRE_MAP[id] : undefined;
        if (genre && !out.includes(genre)) out.push(genre);
    }
    return out;
}

/** v4 read access tokens sunt JWT-uri lungi (încep cu "eyJ"); v3 e o cheie hex scurtă. */
function isV4ReadToken(key: string): boolean {
    return key.startsWith("eyJ");
}

function tmdbFetch(path: string, apiKey: string, extraParams?: Record<string, string>): Promise<Response> {
    const url = new URL(`${TMDB_API_BASE}${path}`);
    const params = { language: "ro-RO", ...extraParams };
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const useBearer = isV4ReadToken(apiKey);
    if (!useBearer) url.searchParams.set("api_key", apiKey);
    return fetch(url.toString(), {
        headers: useBearer ? { Authorization: `Bearer ${apiKey}`, accept: "application/json" } : { accept: "application/json" },
        signal: AbortSignal.timeout(TMDB_FETCH_TIMEOUT_MS),
    });
}

type TmdbVideo = { key: string; site: string; type: string };
type TmdbPopularItem = {
    id: number;
    title?: string;
    original_title?: string;
    overview?: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    vote_average?: number;
    release_date?: string;
    genre_ids?: number[];
};

async function fetchYoutubeTrailerKey(movieId: number, apiKey: string): Promise<string | null> {
    const res = await tmdbFetch(`/movie/${movieId}/videos`, apiKey, {});
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const results = (data as { results?: TmdbVideo[] }).results;
    if (!Array.isArray(results)) return null;
    const trailer = results.find((v) => v.site === "YouTube" && v.type === "Trailer");
    return trailer?.key ?? null;
}

let cache: { expiresAt: number; items: TrailerItem[] } | null = null;

/** Trailere TMDB populare, cu cheia YouTube reală atașată. [] dacă TMDB_API_KEY lipsește sau la orice eroare. */
export async function getPopularTrailers(): Promise<TrailerItem[]> {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) return [];

    if (cache && cache.expiresAt > Date.now()) return cache.items;

    try {
        const res = await tmdbFetch("/movie/popular", apiKey, { page: "1" });
        if (!res.ok) {
            logger.warn({ status: res.status }, "tmdb popular movies request failed");
            return cache?.items ?? [];
        }
        const data: unknown = await res.json();
        const results = (data as { results?: TmdbPopularItem[] }).results;
        if (!Array.isArray(results)) return cache?.items ?? [];

        const candidates = results.slice(0, TMDB_MAX_ITEMS);
        const withTrailers = await Promise.all(
            candidates.map(async (item): Promise<TrailerItem | null> => {
                const youtubeKey = await fetchYoutubeTrailerKey(item.id, apiKey).catch(() => null);
                if (!youtubeKey) return null;
                return {
                    id: `trailer-${item.id}`,
                    tmdbId: item.id,
                    title: item.title || item.original_title || "",
                    originalTitle: item.original_title || item.title || "",
                    overview: item.overview || "",
                    posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
                    backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null,
                    voteAverage: Math.round((item.vote_average || 0) * 10) / 10,
                    releaseYear: (item.release_date || "").substring(0, 4) || "",
                    genres: mapTmdbGenreIds(item.genre_ids),
                    youtubeKey,
                };
            })
        );

        const items = withTrailers.filter((m): m is TrailerItem => m !== null);
        cache = { items, expiresAt: Date.now() + TMDB_CACHE_TTL_MS };
        return items;
    } catch (err) {
        logger.warn({ err }, "tmdb popular movies fetch error");
        return cache?.items ?? [];
    }
}

/** Exportat doar pentru teste unitare. */
export const __testables = { mapTmdbGenreIds, isV4ReadToken, TMDB_GENRE_MAP, MOVIE_GENRES };
