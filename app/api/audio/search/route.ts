import { NextResponse } from "next/server";
import { searchRadioStations } from "@/lib/audio/radio-browser";
import { searchAudiusTracks } from "@/lib/audio/audius";
import { searchJamendoTracks } from "@/lib/audio/jamendo";
import { fetchPodcastEpisodes } from "@/lib/audio/podcast";
import type { AudioItemDto } from "@/lib/audio/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get("q")?.trim() || "";
        const source = searchParams.get("source") || "all";

        if (!query) {
            return NextResponse.json({ items: [] });
        }

        const tasks: Promise<AudioItemDto[]>[] = [];

        if (source === "radio" || source === "all") {
            tasks.push(searchRadioStations(query, 10));
        }
        if (source === "audius" || source === "all") {
            tasks.push(searchAudiusTracks(query, 10));
        }
        if (source === "jamendo" || source === "all") {
            tasks.push(searchJamendoTracks(query, 10));
        }
        if (source === "podcast" || source === "all") {
            tasks.push(fetchPodcastEpisodes(query, "ro", 6));
        }

        const settled = await Promise.allSettled(tasks);
        const results: AudioItemDto[] = [];

        for (const res of settled) {
            if (res.status === "fulfilled" && Array.isArray(res.value)) {
                results.push(...res.value);
            }
        }

        return NextResponse.json({ items: results });
    } catch {
        return NextResponse.json({ items: [] });
    }
}
