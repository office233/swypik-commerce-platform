import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { withErrorHandling } from "@/lib/api-handler";
import { rateLimit } from "@/lib/security/rate-limit";
import { parseBody } from "@/lib/validation/schemas";
import { getSeriesBySlug } from "@/lib/movies/repository";
import { unlockEpisode, unlockSeason } from "@/lib/movies/unlock";
import { getSwypBalanceUnits } from "@/lib/swyp/ledger";

export const dynamic = "force-dynamic";

const BodySchema = z.union([
    z.object({ episodeId: z.string().uuid() }),
    z.object({ season: z.literal(true) }),
]);

const FAILURE_STATUS = { not_found: 404, already_free: 409, series_not_published: 404, insufficient_balance: 402 } as const;

export const POST = withErrorHandling(async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
    if (!isEnabled("movies")) return frozenResponse("movies");
    const user = await getAuthUser();
    if (!user.userId) return NextResponse.json({ error: "auth_required" }, { status: 401 });
    const rl = await rateLimit("moviesUnlock", user.userId);
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const { slug } = await params;
    const series = await getSeriesBySlug(slug);
    if (!series) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const parsed = parseBody(BodySchema, await req.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

    const result = "episodeId" in parsed.data
        ? await unlockEpisode({ userId: user.userId, episodeId: parsed.data.episodeId })
        : await unlockSeason({ userId: user.userId, seriesId: series.id });

    const balanceUnits = Number(await getSwypBalanceUnits(user.userId));
    if (!result.ok) {
        return NextResponse.json({ error: result.reason, balanceUnits }, { status: FAILURE_STATUS[result.reason] });
    }
    return NextResponse.json({ ...result, balanceUnits });
});
