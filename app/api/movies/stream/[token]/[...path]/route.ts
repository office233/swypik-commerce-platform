import { NextResponse } from "next/server";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { withErrorHandling } from "@/lib/api-handler";
import { rateLimit } from "@/lib/security/rate-limit";
import { verifyStreamToken } from "@/lib/media/stream-token";
import { rewriteHlsPlaylist } from "@/lib/media/hls-rewrite";
import { getStreamSecret } from "@/lib/media/stream-secret";
import { resolveEpisodeMediaUrl, toProxyPath } from "@/lib/media/stream-path";
import { getEpisodeById } from "@/lib/movies/repository";

export const dynamic = "force-dynamic";

const SEGMENT_CACHE_SECONDS = 300;
const PASSTHROUGH_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges"] as const;

/**
 * GET /api/movies/stream/[token]/[...path]
 *
 * Token HMAC (user + episod, expiră) + cale RELATIVĂ la directorul episodului.
 * URL-ul real al episodului vine din DB pe baza token-ului și nu ajunge
 * niciodată la client; orice cale care iese din director este refuzată.
 * Playlist-urile HLS se rescriu ca fiecare segment să treacă tot pe aici.
 */
export const GET = withErrorHandling(async function GET(req: Request, { params }: { params: Promise<{ token: string; path: string[] }> }) {
    if (!isEnabled("movies")) return frozenResponse("movies");
    const { token, path } = await params;
    const payload = verifyStreamToken(token, getStreamSecret());
    if (!payload || payload.scope !== "movies") return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const rl = await rateLimit("moviesStream", `${payload.userId}:${payload.mediaId}`);
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const episode = await getEpisodeById(payload.mediaId);
    if (!episode?.playback_url) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const target = resolveEpisodeMediaUrl(episode.playback_url, path.join("/"));
    if (!target) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const range = req.headers.get("range");
    const upstream = await fetch(target, { headers: range ? { range } : {} });
    if (!upstream.ok && upstream.status !== 206) return NextResponse.json({ error: "upstream" }, { status: 502 });

    const contentType = upstream.headers.get("content-type") ?? "";
    const isPlaylist = /mpegurl|m3u8/i.test(contentType) || /\.m3u8(\?|$)/i.test(target);
    if (isPlaylist) {
        const text = await upstream.text();
        const rewritten = rewriteHlsPlaylist(text, target, (abs) => toProxyPath(token, abs, episode.playback_url!));
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
