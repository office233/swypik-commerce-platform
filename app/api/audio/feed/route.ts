import { NextResponse } from "next/server";
import { getCuratedRomanianRadios, getTopGlobalRadios } from "@/lib/audio/radio-browser";
import { getTrendingAudiusTracks } from "@/lib/audio/audius";
import { getChillJamendoTracks } from "@/lib/audio/jamendo";
import { getTrendingPodcasts } from "@/lib/audio/podcast";
import type { AudioFeedResponse, AudioFeedSection } from "@/lib/audio/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tab = searchParams.get("tab");
        const isAll = !tab || tab === "all";

        const sections: AudioFeedSection[] = [];

        if (isAll || tab === "radio") {
            const [roRadios, globalRadios] = await Promise.all([
                getCuratedRomanianRadios(),
                getTopGlobalRadios(12),
            ]);

            sections.push({
                id: "section-radio-ro",
                title: "Radio România Live",
                subtitle: "Fluxuri oficiale live din România (Kiss FM, ZU, Europa FM, Rock FM etc.)",
                source: "radio",
                items: roRadios,
            });

            if (globalRadios.length > 0) {
                sections.push({
                    id: "section-radio-global",
                    title: "Top Radiouri Internaționale",
                    subtitle: "Cele mai ascultate posturi de radio din Europa și SUA",
                    source: "radio",
                    items: globalRadios,
                });
            }
        }

        if (isAll || tab === "audius") {
            const audiusTracks = await getTrendingAudiusTracks(15);
            sections.push({
                id: "section-audius",
                title: "Muzică & Beat-uri (Audius)",
                subtitle: "Trending electronic, trap, synthwave și beat-uri urbane de la artiști independenți",
                source: "audius",
                items: audiusTracks,
            });
        }

        if (isAll || tab === "jamendo") {
            const jamendoTracks = await getChillJamendoTracks(15);
            sections.push({
                id: "section-jamendo",
                title: "Chill, Indie & Lounge (Jamendo)",
                subtitle: "Muzică relaxantă, acustică și lo-fi licențiată Creative Commons",
                source: "jamendo",
                items: jamendoTracks,
            });
        }

        if (isAll || tab === "podcast") {
            const podcastEpisodes = await getTrendingPodcasts();
            sections.push({
                id: "section-podcasts",
                title: "Podcasturi & Emisiuni",
                subtitle: "Episoade recente: Mind Architect, Recorder, Huberman Lab și altele",
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
    } catch (err) {
        return NextResponse.json(
            { error: "A apărut o eroare la încărcarea fluxului audio." },
            { status: 500 }
        );
    }
}
