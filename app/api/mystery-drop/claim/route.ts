import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { claimDailyDrop, type ClaimFailure } from "@/lib/mystery-drop/engine";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { rateLimit } from "@/lib/security/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

const FAILURE_STATUS: Record<ClaimFailure, number> = {
    already_claimed: 409,
    daily_cap_reached: 409,
    rule_disabled: 503,
    rule_missing: 503,
    paid_tx_required: 503,
};

export const POST = withErrorHandling(async function POST() {
    if (!isEnabled("mysteryDrop")) return frozenResponse("mysteryDrop");

    const session = await getAuthSession();
    if (!session?.userId) {
        return NextResponse.json({ success: false, requireAuth: true, error: "auth_required" }, { status: 401 });
    }

    const rl = await rateLimit("mysteryDrop", session.userId);
    if (!rl.success) {
        return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });
    }

    const result = await claimDailyDrop(session.userId);
    if (!result.ok) {
        return NextResponse.json(
            { success: false, error: result.reason, alreadyClaimed: result.reason === "already_claimed" },
            { status: FAILURE_STATUS[result.reason] },
        );
    }

    return NextResponse.json({ success: true, reward: result.reward, claimedAt: result.claimedAt });
});
