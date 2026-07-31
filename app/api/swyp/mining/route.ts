/**
 * GET  /api/swyp/mining  — status sesiune mining (rată, streak, halving, countdown)
 * POST /api/swyp/mining  — { action: "start" | "claim" }
 */
import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { getAuthSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { getMiningStatus, startMiningSession, claimMiningSession } from "@/lib/swyp/mining";
import { getOrCreateChainWallet } from "@/lib/swyp/wallet";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
    const status = await getMiningStatus(session.userId);
    // Fiecare utilizator are un portofel on-chain, creat la prima vizită.
    const wallet = await getOrCreateChainWallet(session.userId).catch(() => null);
    return NextResponse.json({ success: true, mining: status, wallet });
});

export const POST = withErrorHandling(async (req: Request) => {
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });

    const limited = await rateLimit("swypMining", session.userId);
    if (!limited.success) return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "start") {
        const status = await startMiningSession(session.userId);
        return NextResponse.json({ success: true, mining: status });
    }
    if (action === "claim") {
        const result = await claimMiningSession(session.userId);
        return NextResponse.json({ success: result.claimed, ...result });
    }
    return NextResponse.json({ success: false, error: "invalid_action" }, { status: 400 });
});
