import { NextResponse } from "next/server";
import { AudioFeedQuerySchema } from "@/lib/audio/query-schemas";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { withErrorHandling } from "@/lib/api-handler";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { getCuratedRomanianRadios, getTopGlobalRadios } from "@/lib/audio/radio-browser";
import { getTrendingAudiusTracks } from "@/lib/audio/audius";
import { getChillJamendoTracks } from "@/lib/audio/jamendo";
import { getTrendingPodcasts } from "@/lib/audio/podcast";
import type { AudioFeedResponse, AudioFeedSection } from "@/lib/audio/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Titlurile/subtitlurile secțiunilor NU se mai trimit din API (erau hardcodate
// în română) — clientul traduce folosind `section.id` ca cheie stabilă în
// namespace-ul `music.audio.feedSections`.
export const GET = withErrorHandling(async function GET(req: Request) {
    if (!isEnabled("music")) return frozenResponse("music");
    const rl = await rateLimit("musicCatalog", getClientIP(req));
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const parsed = AudioFeedQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: "invalid_query", sections: [] }, { status: 400 });
    const { tab } = parsed.data;
    const isAll = tab === "all";

    const sections: AudioFeedSection[] = [];

    if (isAll || tab === "radio") {
        const [roRadios, globalRadios] = await Promise.all([
            getCuratedRomanianRadios(),
            getTopGlobalRadios(12),
        ]);

        sections.push({
            id: "section-radio-ro",
            source: "radio",
            items: roRadios,
        });

        if (globalRadios.length > 0) {
            sections.push({
                id: "section-radio-global",
                source: "radio",
                items: globalRadios,
            });
        }
    }

    if (isAll || tab === "audius") {
        const audiusTracks = await getTrendingAudiusTracks(15);
        sections.push({
            id: "section-audius",
            source: "audius",
            items: audiusTracks,
        });
    }

    if (isAll || tab === "jamendo") {
        const jamendoTracks = await getChillJamendoTracks(15);
        sections.push({
            id: "section-jamendo",
            source: "jamendo",
            items: jamendoTracks,
        });
    }

    if (isAll || tab === "podcast") {
        const podcastEpisodes = await getTrendingPodcasts();
        sections.push({
            id: "section-podcasts",
            source: "podcast",
            items: podcastEpisodes,
        });
    }

    const response: AudioFeedResponse = { sections };

    return NextResponse.json(response, {
        headers: {
            "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
        },
    });
});
