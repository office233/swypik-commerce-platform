import { NextResponse } from "next/server";
import { frozenResponse, isEnabled } from "@/lib/feature-flags";
import {
  getOrCreateSocialUser,
  setAnonSessionCookie,
} from "@/lib/social/session";
import { markRead } from "@/lib/dm/repository";
import { rateLimit } from "@/lib/security/rate-limit";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

/** POST /api/dm/conversations/[id]/read — mark conversation read. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isEnabled("dm")) return frozenResponse("dm");
  try {
    const session = await getOrCreateSocialUser();
    const userId = session.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await rateLimit("dmRead", userId);
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const { id: conversationId } = await params;
    const result = await markRead(conversationId, userId);
    const response = NextResponse.json({
      ok: true,
      last_read_at: result?.last_read_at ?? null,
    });
    setAnonSessionCookie(response, session.anonSessionId);
    return response;
  } catch (err: any) {
    if (err?.status === 403) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    logger.error({ err: err }, "[DM] mark read:");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
