import { NextResponse } from "next/server";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { withErrorHandling } from "@/lib/api-handler";
import { rateLimit } from "@/lib/security/rate-limit";
import { verifyStreamToken } from "@/lib/movies/stream-token";
import { rewriteHlsPlaylist, isAllowedMediaUrl } from "@/lib/movies/hls-rewrite";
import { getStreamSecret, allowedMediaOrigins } from "@/lib/movies/stream-secret";
import { getEpisodeById } from "@/lib/movies/repository";

export const dynamic = "force-dynamic";

const SEGMENT_CACHE_SECONDS = 300;
const PASSTHROUGH_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges"] as const;

/**
 * GET /api/movies/stream/[token]?p=<url media>
 * Token-ul (HMAC, user+episod, expiră) + verificarea că `p` este pe o origine
 * media a platformei. Playlist-urile HLS se rescriu ca fiecare segment să
 * treacă tot pe aici; segmentele se transmit ca atare.
 */
export const GET = withErrorHandling(async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
    if (!isEnabled("movies")) return frozenResponse("movies");
    const { token } = await params;
    const payload = verifyStreamToken(token, getStreamSecret());
    if (!payload) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const rl = await rateLimit("moviesStream", `${payload.userId}:${payload.episodeId}`);
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const target = new URL(req.url).searchParams.get("p");
    if (!target || !isAllowedMediaUrl(target, allowedMediaOrigins())) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    // Token-ul e legat de episod; media cerută trebuie să fie a acelui episod
    // (același director cu playback_url) — altfel un token valid ar servi orice obiect.
    const episode = await getEpisodeById(payload.episodeId);
    const episodeDir = episode?.playback_url ? episode.playback_url.slice(0, episode.playback_url.lastIndexOf("/") + 1) : null;
    if (!episodeDir || !target.startsWith(episodeDir)) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const range = req.headers.get("range");
    const upstream = await fetch(target, { headers: range ? { range } : {} });
    if (!upstream.ok && upstream.status !== 206) return NextResponse.json({ error: "upstream" }, { status: 502 });

    const contentType = upstream.headers.get("content-type") ?? "";
    const isPlaylist = /mpegurl|m3u8/i.test(contentType) || /\.m3u8(\?|$)/i.test(target);
    if (isPlaylist) {
        const text = await upstream.text();
        const rewritten = rewriteHlsPlaylist(text, target, (abs) => `/api/movies/stream/${token}?p=${encodeURIComponent(abs)}`);
        return new NextResponse(rewritten, {
            status: 200,
            headers: { "content-type": "application/vnd.apple.mpegurl", "cache-control": "private, no-store" },
        });
    }
    const headers = new Headers({ "cache-control": `private, max-age=${SEGMENT_CACHE_SECONDS}` });
    for (const h of PASSTHROUGH_HEADERS) {
        const v = upstream.headers.get(h);
        if (v) headers.set(h, v);
    }
    return new NextResponse(upstream.body, { status: upstream.status, headers });
});
