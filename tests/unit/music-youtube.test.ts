import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// lib/music/youtube.ts importă `@/lib/db` dinamic (`await import(...)`) doar
// când are nevoie de cache — mock-uim modulul ca să nu lovim o bază reală și
// ca să forțăm calea de rețea (cache gol => merge la YouTube API).
vi.mock("@/lib/db", () => ({
    dbQuery: vi.fn(async () => ({ rows: [] })),
}));

import { parseIsoDuration, cleanHtmlEntities, searchYouTubeMusic, getYouTubeTrackByVideoId } from "@/lib/music/youtube";

const ORIGINAL_API_KEY = process.env.YOUTUBE_API_KEY;

function jsonResponse(body: unknown, ok = true, status = 200): Response {
    return {
        ok,
        status,
        json: async () => body,
    } as Response;
}

describe("music/youtube", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        if (ORIGINAL_API_KEY === undefined) delete process.env.YOUTUBE_API_KEY;
        else process.env.YOUTUBE_API_KEY = ORIGINAL_API_KEY;
    });

    describe("parseIsoDuration", () => {
        it("calculeaza corect minute si secunde", () => {
            expect(parseIsoDuration("PT3M45S")).toBe((3 * 60 + 45) * 1000);
        });

        it("calculeaza corect ore, minute si secunde", () => {
            expect(parseIsoDuration("PT1H2M30S")).toBe((3600 + 2 * 60 + 30) * 1000);
        });

        it("calculeaza corect doar secunde", () => {
            expect(parseIsoDuration("PT45S")).toBe(45 * 1000);
        });

        it("calculeaza corect doar minute", () => {
            expect(parseIsoDuration("PT4M")).toBe(4 * 60 * 1000);
        });

        it("returneaza default cand formatul este invalid", () => {
            expect(parseIsoDuration("invalid")).toBe(180_000);
        });
    });

    describe("cleanHtmlEntities", () => {
        it("decodeaza corect entitati uzuale din titlurile YouTube", () => {
            const raw = "Queen &amp; David Bowie &quot;Under Pressure&#39;s&quot; &lt;Live&gt;";
            expect(cleanHtmlEntities(raw)).toBe("Queen & David Bowie \"Under Pressure's\" <Live>");
        });
    });

    describe("searchYouTubeMusic", () => {
        it("returneaza lista goala pentru query gol, fara sa apeleze reteaua", async () => {
            const fetchSpy = vi.fn();
            vi.stubGlobal("fetch", fetchSpy);
            const empty = await searchYouTubeMusic("");
            expect(empty).toEqual([]);
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it("NU mai inventeaza piese fictive cand lipseste YOUTUBE_API_KEY — returneaza lista goala", async () => {
            delete process.env.YOUTUBE_API_KEY;
            const fetchSpy = vi.fn();
            vi.stubGlobal("fetch", fetchSpy);
            const result = await searchYouTubeMusic(`fara-cheie-${Date.now()}`);
            expect(result).toEqual([]);
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it("mapeaza corect raspunsul YouTube API cand cheia este configurata", async () => {
            process.env.YOUTUBE_API_KEY = "test-key";
            const fetchSpy = vi.fn(async (url: string, _opts?: RequestInit) => {
                if (url.includes("/search")) {
                    return jsonResponse({
                        items: [
                            {
                                id: { videoId: "abc123XYZ_" },
                                snippet: {
                                    title: "Test &amp; Song",
                                    channelTitle: "Test Channel",
                                    channelId: "UCtest",
                                    thumbnails: { high: { url: "https://i.ytimg.com/vi/abc123XYZ_/hqdefault.jpg" } },
                                },
                            },
                        ],
                    });
                }
                if (url.includes("/videos")) {
                    return jsonResponse({ items: [{ id: "abc123XYZ_", contentDetails: { duration: "PT3M20S" } }] });
                }
                throw new Error(`unexpected url: ${url}`);
            });
            vi.stubGlobal("fetch", fetchSpy);

            const results = await searchYouTubeMusic(`query-${Date.now()}`);
            expect(results).toHaveLength(1);
            const first = results[0];
            expect(first.source).toBe("youtube");
            expect(first.youtubeVideoId).toBe("abc123XYZ_");
            expect(first.title).toBe("Test & Song");
            expect(first.durationMs).toBe(200_000);
            // fiecare cerere externă trebuie să poarte un timeout — verificăm indirect prin
            // faptul că opțiunile de fetch includ un AbortSignal
            const callOpts = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
            expect(callOpts?.signal).toBeInstanceOf(AbortSignal);
        });

        it("returneaza lista goala (fara fallback fictiv) daca YouTube API raspunde cu eroare", async () => {
            process.env.YOUTUBE_API_KEY = "test-key";
            vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false, 500)));
            const result = await searchYouTubeMusic(`eroare-${Date.now()}`);
            expect(result).toEqual([]);
        });

        it("returneaza lista goala (fara fallback fictiv) daca fetch arunca o exceptie", async () => {
            process.env.YOUTUBE_API_KEY = "test-key";
            vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
            const result = await searchYouTubeMusic(`exceptie-${Date.now()}`);
            expect(result).toEqual([]);
        });
    });

    describe("getYouTubeTrackByVideoId", () => {
        it("returneaza null pentru un id gol, fara sa apeleze reteaua", async () => {
            const fetchSpy = vi.fn();
            vi.stubGlobal("fetch", fetchSpy);
            const result = await getYouTubeTrackByVideoId("");
            expect(result).toBeNull();
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it("returneaza null daca lipseste cheia API si nu exista randul in DB", async () => {
            delete process.env.YOUTUBE_API_KEY;
            const result = await getYouTubeTrackByVideoId("necunoscut123");
            expect(result).toBeNull();
        });

        it("gaseste o piesa prin API cand cheia este configurata", async () => {
            process.env.YOUTUBE_API_KEY = "test-key";
            vi.stubGlobal("fetch", vi.fn(async () =>
                jsonResponse({
                    items: [
                        {
                            id: "kJQP7kiw5Fk",
                            snippet: {
                                title: "Despacito",
                                channelTitle: "Luis Fonsi",
                                channelId: "UCtest2",
                                thumbnails: { high: { url: "https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg" } },
                            },
                            contentDetails: { duration: "PT4M42S" },
                        },
                    ],
                })
            ));

            const track = await getYouTubeTrackByVideoId("yt-kJQP7kiw5Fk");
            expect(track).not.toBeNull();
            expect(track?.title).toBe("Despacito");
            expect(track?.source).toBe("youtube");
            expect(track?.youtubeVideoId).toBe("kJQP7kiw5Fk");
        });
    });
});
