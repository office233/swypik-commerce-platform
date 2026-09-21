import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { withErrorHandling } from "@/lib/api-handler";
import { rateLimit } from "@/lib/security/rate-limit";
import { getTrackBySlug } from "@/lib/music/repository";
import { unlockTrack } from "@/lib/music/unlock";
import { getSwypBalanceUnits } from "@/lib/swyp/ledger";

export const dynamic = "force-dynamic";

const FAILURE_STATUS = { not_found: 404, not_premium: 409, not_published: 404, insufficient_balance: 402 } as const;

export const POST = withErrorHandling(async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
    if (!isEnabled("music")) return frozenResponse("music");
    const user = await getAuthUser();
    if (!user.userId) return NextResponse.json({ error: "auth_required" }, { status: 401 });
    const rl = await rateLimit("musicUnlock", user.userId);
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const { slug } = await params;
    const track = await getTrackBySlug(slug);
    if (!track) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const result = await unlockTrack({ userId: user.userId, trackId: track.id });

    const balanceUnits = Number(await getSwypBalanceUnits(user.userId));
    if (!result.ok) {
        return NextResponse.json({ error: result.reason, balanceUnits }, { status: FAILURE_STATUS[result.reason] });
    }
    return NextResponse.json({ ...result, balanceUnits });
});
