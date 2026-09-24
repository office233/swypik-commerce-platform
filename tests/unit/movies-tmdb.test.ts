import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

const ORIGINAL_KEY = process.env.TMDB_API_KEY;

async function freshTmdbModule() {
  vi.resetModules();
  return import("@/lib/movies/tmdb");
}

describe("movies/tmdb", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    process.env.TMDB_API_KEY = ORIGINAL_KEY;
    vi.unstubAllGlobals();
  });

  it("fără TMDB_API_KEY întoarce listă goală, fără niciun fetch", async () => {
    delete process.env.TMDB_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { getPopularTrailers } = await freshTmdbModule();
    const result = await getPopularTrailers();
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("mapează genre_ids TMDB la taxonomia MOVIE_GENRES și ignoră id-urile necunoscute", async () => {
    const { __testables } = await freshTmdbModule();
    // 18 = drama, 28 = action, 99999 = necunoscut (ignorat)
    expect(__testables.mapTmdbGenreIds([18, 28, 99999])).toEqual(["drama", "action"]);
    expect(__testables.mapTmdbGenreIds(undefined)).toEqual([]);
  });

  it("alege primul trailer YouTube (type=Trailer, site=YouTube) din /videos", async () => {
    process.env.TMDB_API_KEY = "test-v3-key";
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes("/movie/popular")) {
        return new Response(
          JSON.stringify({
            results: [
              { id: 42, title: "Filmul X", original_title: "Movie X", overview: "O poveste.", poster_path: "/p.jpg", backdrop_path: "/b.jpg", vote_average: 8.234, release_date: "2026-01-15", genre_ids: [18] },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes("/movie/42/videos")) {
        return new Response(
          JSON.stringify({
            results: [
              { key: "teaser1", site: "YouTube", type: "Teaser" },
              { key: "trailer1", site: "YouTube", type: "Trailer" },
              { key: "trailer2", site: "Vimeo", type: "Trailer" },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { getPopularTrailers } = await freshTmdbModule();
    const items = await getPopularTrailers();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      tmdbId: 42,
      title: "Filmul X",
      youtubeKey: "trailer1",
      genres: ["drama"],
      voteAverage: 8.2,
      releaseYear: "2026",
      posterUrl: "https://image.tmdb.org/t/p/w500/p.jpg",
    });
  });

  it("omite filmele fără trailer YouTube", async () => {
    process.env.TMDB_API_KEY = "test-v3-key";
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes("/movie/popular")) {
        return new Response(JSON.stringify({ results: [{ id: 7, title: "Fără trailer", genre_ids: [] }] }), { status: 200 });
      }
      if (url.includes("/movie/7/videos")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { getPopularTrailers } = await freshTmdbModule();
    expect(await getPopularTrailers()).toEqual([]);
  });

  it("la timeout/eroare de rețea întoarce listă goală, fără să arunce", async () => {
    process.env.TMDB_API_KEY = "test-v3-key";
    const fetchSpy = vi.fn(async () => { throw new Error("network timeout"); });
    vi.stubGlobal("fetch", fetchSpy);
    const { getPopularTrailers } = await freshTmdbModule();
    await expect(getPopularTrailers()).resolves.toEqual([]);
  });

  it("cu un răspuns non-ok de la TMDB, întoarce listă goală", async () => {
    process.env.TMDB_API_KEY = "test-v3-key";
    const fetchSpy = vi.fn(async () => new Response("error", { status: 500 }));
    vi.stubGlobal("fetch", fetchSpy);
    const { getPopularTrailers } = await freshTmdbModule();
    expect(await getPopularTrailers()).toEqual([]);
  });

  it("recunoaște un read access token v4 (JWT) și trimite Authorization: Bearer, fără api_key în URL", async () => {
    process.env.TMDB_API_KEY = "eyJhbGciOiJIUzI1NiJ9.faketoken.sig";
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/movie/popular")) {
        expect(url).not.toContain("api_key=");
        expect((init?.headers as Record<string, string>)?.Authorization).toBe("Bearer eyJhbGciOiJIUzI1NiJ9.faketoken.sig");
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { getPopularTrailers } = await freshTmdbModule();
    await getPopularTrailers();
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("cu o cheie v3 (nu JWT), trimite api_key ca query param, fără header Authorization", async () => {
    process.env.TMDB_API_KEY = "abc123hexkey";
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/movie/popular")) {
        expect(url).toContain("api_key=abc123hexkey");
        expect((init?.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined();
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { getPopularTrailers } = await freshTmdbModule();
    await getPopularTrailers();
    expect(fetchSpy).toHaveBeenCalled();
  });
});
