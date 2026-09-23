import { describe, it, expect } from "vitest";
import { parseIsoDuration, cleanHtmlEntities, searchYouTubeMusic, getYouTubeTrackByVideoId } from "@/lib/music/youtube";

describe("music/youtube", () => {
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
        it("returneaza piese valide cu campuri YouTube cand query este gol sau gasit", async () => {
            const empty = await searchYouTubeMusic("");
            expect(empty).toEqual([]);

            const results = await searchYouTubeMusic("shape of you");
            expect(results.length).toBeGreaterThan(0);
            const first = results[0];
            expect(first.source).toBe("youtube");
            expect(first.youtubeVideoId).toBeTruthy();
            expect(first.title).toBeTruthy();
            expect(first.durationMs).toBeGreaterThan(0);
        });
    });

    describe("getYouTubeTrackByVideoId", () => {
        it("gaseste o piesa dupa videoId sau slug yt-...", async () => {
            const track1 = await getYouTubeTrackByVideoId("kJQP7kiw5Fk");
            expect(track1).not.toBeNull();
            expect(track1?.title).toBe("Despacito");
            expect(track1?.source).toBe("youtube");

            const track2 = await getYouTubeTrackByVideoId("yt-kJQP7kiw5Fk");
            expect(track2).not.toBeNull();
            expect(track2?.title).toBe("Despacito");

            const notFound = await getYouTubeTrackByVideoId("");
            expect(notFound).toBeNull();
        });
    });
});
