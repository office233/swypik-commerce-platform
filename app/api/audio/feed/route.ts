import { NextResponse } from "next/server";
import { AudioFeedQuerySchema } from "@/lib/audio/query-schemas";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { withErrorHandling } from "@/lib/api-handler";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { getCuratedRomanianRadios, getTopGlobalRadios } from "@/lib/audio/radio-browser";
import { getTrendingAudiusTracks } from "@/lib/audio/audius";
import { getChillJamendoTracks, isJamendoConfigured } from "@/lib/audio/jamendo";
import { getTrendingPodcasts } from "@/lib/audio/podcast";
import type { AudioFeedResponse, AudioFeedSection, AudioSourceType } from "@/lib/audio/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GLOBAL_RADIO_LIMIT = 12;
const SOURCE_ROW_LIMIT = 15;

/**
 * GET /api/audio/feed?tab=all|radio|audius|jamendo|podcast
 *
 * Doar secțiuni cu conținut (cele goale nu se trimit) și doar stream-uri
 * https. Sursele care cer cheie și nu o au (Jamendo) apar în `unconfigured` —
 * clientul arată starea „neconfigurat", nu un rând gol sau date false.
 * Titlurile secțiunilor le traduce clientul după `section.id`.
 */
export const GET = withErrorHandling(async function GET(req: Request) {
    if (!isEnabled("music")) return frozenResponse("music");
    const rl = await rateLimit("musicCatalog", getClientIP(req));
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const parsed = AudioFeedQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: "invalid_query", sections: [], unconfigured: [] }, { status: 400 });
    const { tab } = parsed.data;
    const want = (s: AudioSourceType) => tab === "all" || tab === s;
    const jamendoReady = isJamendoConfigured();

    const [roRadios, globalRadios, audius, jamendo, podcasts] = await Promise.all([
        want("radio") ? getCuratedRomanianRadios() : [],
        want("radio") ? getTopGlobalRadios(GLOBAL_RADIO_LIMIT) : [],
        want("audius") ? getTrendingAudiusTracks(SOURCE_ROW_LIMIT) : [],
        want("jamendo") && jamendoReady ? getChillJamendoTracks(SOURCE_ROW_LIMIT) : [],
        want("podcast") ? getTrendingPodcasts() : [],
    ]);

    const candidates: AudioFeedSection[] = [
        { id: "section-radio-ro", source: "radio", items: roRadios },
        { id: "section-radio-global", source: "radio", items: globalRadios },
        { id: "section-audius", source: "audius", items: audius },
        { id: "section-jamendo", source: "jamendo", items: jamendo },
        { id: "section-podcasts", source: "podcast", items: podcasts },
    ];
    const response: AudioFeedResponse = {
        sections: candidates.filter((s) => s.items.length > 0),
        unconfigured: jamendoReady ? [] : ["jamendo"],
    };
    return NextResponse.json(response, {
        headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
    });
});
