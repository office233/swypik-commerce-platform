import { describe, it, expect } from "vitest";
import { buildHomeRows } from "@/lib/movies/home";
import type { SeriesDto } from "@/lib/movies/types";
import type { TrailerItem } from "@/lib/movies/tmdb";

const dto = (id: string, genres: string[], isOfficial = false): SeriesDto => ({
  id, slug: id, title: id, synopsis: "", genres, coverUrl: null, posterUrl: null, trailerVideoId: null,
  freeEpisodes: 3, episodePriceUnits: 500, seasonPriceUnits: 0, seasonDiscountPct: 40, isAdult: false, episodeCount: 10,
  owner: { id: "o", name: "Swypik", isOfficial },
});

const trailer = (id: string, genres: TrailerItem["genres"] = ["drama"]): TrailerItem => ({
  id, tmdbId: Number(id.replace(/\D/g, "")) || 1, title: `Trailer ${id}`, originalTitle: `Trailer ${id}`,
  overview: "", posterUrl: null, backdropUrl: null, voteAverage: 7.5, releaseYear: "2026", genres, youtubeKey: "abc123",
});

describe("movies/home — trailers TMDB", () => {
  it("fără trailere, nu apare niciun rând 'trailers'", () => {
    const trending = [dto("a", ["drama"], true)];
    const rows = buildHomeRows({ trending, latest: [], continueWatching: [], watchlist: [] });
    expect(rows.some((r) => r.kind === "trailers")).toBe(false);
  });

  it("trailerele apar doar în rândul propriu 'trailers', niciodată în originals/top10/genre", () => {
    const trending = [dto("a", ["drama"], true), dto("b", ["drama"])];
    const trailers = [trailer("t1", ["drama"]), trailer("t2", ["action"])];
    const rows = buildHomeRows({ trending, latest: [], continueWatching: [], watchlist: [], trailers });

    const trailerRow = rows.find((r) => r.kind === "trailers");
    expect(trailerRow?.items.map((t) => t.id)).toEqual(["t1", "t2"]);

    // Nici un rând de catalog real nu conține obiecte TrailerItem (verificat prin id-uri distincte "t*").
    const top10 = rows.find((r) => r.kind === "top10");
    const originals = rows.find((r) => r.kind === "originals");
    const genreRows = rows.filter((r) => r.kind === "genre");
    const idsInCatalogRows = [
      ...(top10?.items.map((s) => s.id) ?? []),
      ...(originals?.items.map((s) => s.id) ?? []),
      ...genreRows.flatMap((r) => r.items.map((s) => s.id)),
    ];
    expect(idsInCatalogRows).not.toContain("t1");
    expect(idsInCatalogRows).not.toContain("t2");
  });

  it("rândul trailers e limitat la HOME_ROW_MAX", () => {
    const trending = [dto("a", ["drama"], true)];
    const many = Array.from({ length: 25 }, (_, i) => trailer(`t${i}`));
    const rows = buildHomeRows({ trending, latest: [], continueWatching: [], watchlist: [], trailers: many });
    const trailerRow = rows.find((r) => r.kind === "trailers");
    expect(trailerRow?.items.length).toBe(20);
  });
});
