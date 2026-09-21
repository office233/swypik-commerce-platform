export type SeriesStatus = "draft" | "pending_review" | "published" | "archived";
export type EpisodeStatus = "draft" | "published";

export type MovieSeriesRow = {
    id: string;
    slug: string;
    owner_user_id: string;
    title: string;
    synopsis: string;
    genres: string[];
    language_code: string;
    cover_url: string | null;
    poster_url: string | null;
    trailer_video_id: string | null;
    status: SeriesStatus;
    free_episodes: number;
    /** bigint în DB; pg îl întoarce ca string — normalizat la number în repository. */
    episode_price_units: number;
    is_adult: boolean;
    license_note: string | null;
    published_at: string | null;
    created_at: string;
    updated_at: string;
};

export type MovieEpisodeRow = {
    id: string;
    series_id: string;
    episode_number: number;
    video_id: string;
    title: string;
    duration_ms: number | null;
    status: EpisodeStatus;
    created_at: string;
    updated_at: string;
};

export type MovieUnlockRow = {
    id: string;
    user_id: string;
    series_id: string;
    episode_id: string | null;
    units_paid: number;
    creator_share_units: number;
    ledger_ref: string | null;
    created_at: string;
};

export type MovieProgressRow = {
    user_id: string;
    episode_id: string;
    position_ms: number;
    completed: boolean;
    updated_at: string;
};

/** Ce știe serverul despre viewer când calculează accesul. */
export type ViewerContext = {
    userId: string | null;
    isAdmin: boolean;
    unlockedEpisodeIds: ReadonlySet<string>;
    hasSeasonUnlock: boolean;
};

/** DTO public pentru un episod în pagina serialului / player. */
export type EpisodeDto = {
    id: string;
    number: number;
    title: string;
    durationMs: number | null;
    locked: boolean;
    priceUnits: number;
    progress: { positionMs: number; completed: boolean } | null;
};

export type SeriesDto = {
    id: string;
    slug: string;
    title: string;
    synopsis: string;
    genres: string[];
    coverUrl: string | null;
    posterUrl: string | null;
    trailerVideoId: string | null;
    freeEpisodes: number;
    episodePriceUnits: number;
    seasonPriceUnits: number;
    isAdult: boolean;
    episodeCount: number;
    owner: { id: string; name: string; isOfficial: boolean };
};
