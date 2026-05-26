import { NextResponse } from "next/server";
import { frozenResponse, isEnabled } from "@/lib/feature-flags";
import {
  getOptionalSocialUserId,
  getOrCreateSocialUser,
  setAnonSessionCookie,
} from "@/lib/social/session";
import {
  getOrCreateDmConversation,
  listConversations,
} from "@/lib/dm/repository";
import { rateLimit } from "@/lib/security/rate-limit";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

/** GET /api/dm/conversations — list current user's conversations. */
export async function GET(request: Request) {
  if (!isEnabled("dm")) return frozenResponse("dm");
  try {
    const userId = await getOptionalSocialUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || 30);
    const cursor = url.searchParams.get("cursor");

    const conversations = await listConversations(userId, { limit, cursor });
    return NextResponse.json({ conversations });
  } catch (err: any) {
    logger.error({ err: err }, "[DM] list conversations:");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** POST /api/dm/conversations { peer_user_id } — get-or-create DM. */
export async function POST(request: Request) {
  if (!isEnabled("dm")) return frozenResponse("dm");
  try {
    const session = await getOrCreateSocialUser();
    const userId = session.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await rateLimit("dmConversation", userId);
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const body = await request.json().catch(() => ({}));
    const peerId = String(body?.peer_user_id || "").trim();
    if (!peerId) {
      return NextResponse.json({ error: "peer_user_id required" }, { status: 400 });
    }
    if (peerId === userId) {
      return NextResponse.json({ error: "Cannot DM yourself" }, { status: 400 });
    }

    const { conversationId, isNew } = await getOrCreateDmConversation(userId, peerId);
    const response = NextResponse.json({
      conversation_id: conversationId,
      is_new: isNew,
    });
    setAnonSessionCookie(response, session.anonSessionId);
    return response;
  } catch (err: any) {
    logger.error({ err: err }, "[DM] create conversation:");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
