import { NextRequest, NextResponse } from "next/server";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { getAccountUserId } from "@/lib/social/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { declineCall, CallAuthError, CallNotFoundError } from "@/lib/messenger/calls";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** POST /api/messenger/calls/[id]/decline — callee rejects a ringing call. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isEnabled("messenger")) return frozenResponse("messenger");
  try {
    // Cont real obligatoriu: anonimii nu pot scrie DM / apela (audit messenger P0).
    const userId = await getAccountUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await rateLimit("messengerCallSignal", userId, { limit: 30, window: 60 });
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const { id: callId } = await params;
    await declineCall(userId, callId);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof CallAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof CallNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error({ err }, "[messenger] call decline failed");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
