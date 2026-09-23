import { NextResponse } from "next/server";
import { z } from "zod";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { withErrorHandling } from "@/lib/api-handler";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { searchYouTubeMusic } from "@/lib/music/youtube";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
    q: z.string().trim().min(1).max(100),
    limit: z.coerce.number().int().min(1).max(30).default(15),
});

export const GET = withErrorHandling(async function GET(req: Request) {
    if (!isEnabled("music")) return frozenResponse("music");
    const rl = await rateLimit("musicCatalog", getClientIP(req));
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: "invalid_query", items: [] }, { status: 400 });

    const { q, limit } = parsed.data;
    const items = await searchYouTubeMusic(q, limit);

    return NextResponse.json({ items });
});
