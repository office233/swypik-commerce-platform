/**
 * Client TMDB (The Movie Database) & Catalog Cinema 4K pentru Swypik Movies.
 * Oferă postere oficiale, sinopsis în română, note, genuri și trailere oficiale 4K.
 * Include fallback complet de blockbustere (2025-2026) dacă TMDB_API_KEY nu este setat.
 */

export interface TmdbMovieDto {
    id: string;
    title: string;
    originalTitle: string;
    overview: string;
    posterUrl: string;
    backdropUrl: string;
    rating: number; // 0 - 10
    releaseYear: string;
    genres: string[];
    trailerYoutubeKey?: string | null;
    tagline?: string;
    durationMinutes?: number;
    badge?: string;
}

export const CURATED_TMDB_MOVIES: TmdbMovieDto[] = [
    {
        id: "tmdb-dune-2",
        title: "Dune: Partea a II-a",
        originalTitle: "Dune: Part Two",
        overview: "Paul Atreides se aliază cu Chani și Fremenii în timp ce caută răzbunare împotriva conspiratorilor care i-au distrus familia. Confruntat cu o alegere între dragostea vieții sale și soarta universului cunoscut, el încearcă să prevină un viitor teribil pe care numai el îl poate prevedea.",
        posterUrl: "https://image.tmdb.org/t/p/w500/8b8R8l88Qje9dn9OE8PY05Nxl1X.jpg",
        backdropUrl: "https://image.tmdb.org/t/p/original/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg",
        rating: 8.6,
        releaseYear: "2024",
        genres: ["action", "fantasy"],
        trailerYoutubeKey: "Way9Dexny3w",
        tagline: "Lupta pentru Arrakis continuă.",
        durationMinutes: 166,
        badge: "TOP 10",
    },
    {
        id: "tmdb-oppenheimer",
        title: "Oppenheimer",
        originalTitle: "Oppenheimer",
        overview: "Povestea fizicianului american J. Robert Oppenheimer, supranumit „părintele bombei atomice”, și rolul său crucial în Proiectul Manhattan în timpul celui de-al Doilea Război Mondial.",
        posterUrl: "https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
        backdropUrl: "https://image.tmdb.org/t/p/original/rLb2cwF3Pazuxaj0sRXQ037tGI1.jpg",
        rating: 8.9,
        releaseYear: "2023",
        genres: ["drama"],
        trailerYoutubeKey: "uYPbbksJxIg",
        tagline: "Lumea se schimbă pentru totdeauna.",
        durationMinutes: 180,
        badge: "OSCAR",
    },
    {
        id: "tmdb-gladiator-2",
        title: "Gladiatorul II",
        originalTitle: "Gladiator II",
        overview: "După ani de zile de la moartea eroului Maximus, Lucius este forțat să intre în Colosseum după ce casa sa este cucerită de împărații tirani care conduc acum Roma cu o mână de fier.",
        posterUrl: "https://image.tmdb.org/t/p/w500/2cxhvwyEwRlysAmRH4iodkvo0z5.jpg",
        backdropUrl: "https://image.tmdb.org/t/p/original/tOqIwliWMovSIZ9DyvHcHI7p2im.jpg",
        rating: 8.1,
        releaseYear: "2024",
        genres: ["action", "drama"],
        trailerYoutubeKey: "4rgYUipGJNo",
        tagline: "Ce facem în viață răsună în eternitate.",
        durationMinutes: 148,
        badge: "CINEMA 4K",
    },
    {
        id: "tmdb-deadpool-wolverine",
        title: "Deadpool & Wolverine",
        originalTitle: "Deadpool & Wolverine",
        overview: "Un Deadpool apatic din punct de vedere profesional trece printr-o criză a vârstei de mijloc în timp ce lucrează ca vânzător de mașini second-hand. Când universul său este amenințat, el face echipă fără tragere de inimă cu un Wolverine refractar.",
        posterUrl: "https://image.tmdb.org/t/p/w500/tiOVgX0i0uvSyMZYs05P0RKcrhS.jpg",
        backdropUrl: "https://image.tmdb.org/t/p/original/by8z9Fe8y7p4jo2YlW2SZDnptyT.jpg",
        rating: 8.4,
        releaseYear: "2024",
        genres: ["action", "comedy"],
        trailerYoutubeKey: "73_1biulkYk",
        tagline: "Toți merită un final fericit.",
        durationMinutes: 127,
        badge: "BLOCKBUSTER",
    },
    {
        id: "tmdb-interstellar",
        title: "Interstellar: Călătorind prin spațiu",
        originalTitle: "Interstellar",
        overview: "Într-un viitor în care Pământul devine nelocuibil, o echipă de exploratori călătorește printr-o gaură de vierme în spațiu, în încercarea de a asigura supraviețuirea umanității.",
        posterUrl: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
        backdropUrl: "https://image.tmdb.org/t/p/original/xJHokMbljvjADYdit5fK5VQsXEG.jpg",
        rating: 8.7,
        releaseYear: "2014",
        genres: ["fantasy", "drama"],
        trailerYoutubeKey: "zSWdZVtXT7E",
        tagline: "Sfârșitul omenirii nu va fi sfârșitul nostru.",
        durationMinutes: 169,
        badge: "CLASIC 4K",
    },
    {
        id: "tmdb-joker-folie",
        title: "Joker: Folie à Deux",
        originalTitle: "Joker: Folie à Deux",
        overview: "Arthur Fleck este instituționalizat la Arkham în așteptarea procesului pentru crimele sale ca Joker. În timp ce se luptă cu dubla sa identitate, Arthur nu doar că se împiedică de dragostea adevărată, dar găsește și muzica care a fost mereu în el.",
        posterUrl: "https://image.tmdb.org/t/p/w500/IqeME8MTbpar00sQCKVYQe6ML0.jpg",
        backdropUrl: "https://image.tmdb.org/t/p/original/AVWlQpVhpudyFsSh3OQIieHHYf.jpg",
        rating: 7.6,
        releaseYear: "2024",
        genres: ["drama", "crime", "thriller"],
        trailerYoutubeKey: "_OKAwz2NiOI",
        tagline: "Lumea este o scenă.",
        durationMinutes: 138,
        badge: "PREMIERĂ",
    },
    {
        id: "tmdb-miami-bici-2",
        title: "Miami Bici 2",
        originalTitle: "Miami Bici 2",
        overview: "Ion Bilcea și Ilie Piciu ajung în Los Angeles, unde încearcă să-și trăiască visul american, intrând însă în încurcături amuzante cu mafia locală.",
        posterUrl: "https://image.tmdb.org/t/p/w500/dfQ5sSFXAmnPtJRsiUBD82zgFMm.jpg",
        backdropUrl: "https://image.tmdb.org/t/p/original/1pmXyN3sKeYoUhu5VBZiDU4BX21.jpg",
        rating: 7.2,
        releaseYear: "2023",
        genres: ["comedy"],
        trailerYoutubeKey: "v94d_q4QjT0",
        tagline: "Visul american cu aromă românească.",
        durationMinutes: 102,
        badge: "ROMÂNESC",
    },
    {
        id: "tmdb-teambuilding",
        title: "Teambuilding",
        originalTitle: "Teambuilding",
        overview: "Emil lucrează prea mult și speră la o promovare. Când corporația anunță restructurări, el organizează cel mai nebun teambuilding pentru a-și salva filiala.",
        posterUrl: "https://image.tmdb.org/t/p/w500/kvJqs0vm29U0xJa373wlzHb3FRh.jpg",
        backdropUrl: "https://image.tmdb.org/t/p/original/7hYG0v6BEErqqwnU7vWJjWgYJJp.jpg",
        rating: 7.0,
        releaseYear: "2022",
        genres: ["comedy"],
        trailerYoutubeKey: "Z6jS4_47Q1c",
        tagline: "Cea mai mare comedie românească.",
        durationMinutes: 98,
        badge: "ROMÂNESC",
    }
];

export async function getTrendingMovies(): Promise<TmdbMovieDto[]> {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
        return CURATED_TMDB_MOVIES;
    }

    try {
        const res = await fetch(
            `https://api.themoviedb.org/3/trending/movie/week?api_key=${apiKey}&language=ro-RO`,
            { next: { revalidate: 3600 } }
        );

        if (!res.ok) {
            return CURATED_TMDB_MOVIES;
        }

        const data = await res.json();
        if (!data.results || !Array.isArray(data.results)) {
            return CURATED_TMDB_MOVIES;
        }

        const tmdbMovies: TmdbMovieDto[] = data.results.slice(0, 15).map((item: any) => ({
            id: `tmdb-${item.id}`,
            title: item.title || item.original_title,
            originalTitle: item.original_title,
            overview: item.overview || "Descriere în curs de actualizare.",
            posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : CURATED_TMDB_MOVIES[0].posterUrl,
            backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : CURATED_TMDB_MOVIES[0].backdropUrl,
            rating: Math.round((item.vote_average || 7.0) * 10) / 10,
            releaseYear: (item.release_date || "").substring(0, 4) || "2024",
            genres: ["Cinema 4K", "Trending"],
            trailerYoutubeKey: null,
            badge: "TMDB HD",
        }));

        return tmdbMovies.length > 0 ? tmdbMovies : CURATED_TMDB_MOVIES;
    } catch {
        return CURATED_TMDB_MOVIES;
    }
}
