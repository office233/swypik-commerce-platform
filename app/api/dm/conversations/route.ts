import { NextResponse } from "next/server";
import { frozenResponse, isEnabled } from "@/lib/feature-flags";
import {
  getOptionalSocialUserId,
  getAccountUserId,
} from "@/lib/social/session";
import {
  getOrCreateDmConversation,
  listConversations,
} from "@/lib/dm/repository";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { ABUSE_LIMITS } from "@/lib/security/abuse-limits";
import { DmConversationCreateSchema, parseBody } from "@/lib/validation/schemas";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

/** GET /api/dm/conversations — list current user's conversations. */
export async function GET(request: Request) {
  if (!isEnabled("dm") && !isEnabled("messenger")) return frozenResponse("dm");
  try {
    const userId = await getOptionalSocialUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit")) || 30;
    const cursor = url.searchParams.get("cursor");

    const conversations = await listConversations(userId, { limit, cursor });
    return NextResponse.json({ conversations });
  } catch (err: unknown) {
    logger.error({ err: err }, "[DM] list conversations:");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** POST /api/dm/conversations { peer_user_id } — get-or-create DM. */
export async function POST(request: Request) {
  if (!isEnabled("dm") && !isEnabled("messenger")) return frozenResponse("dm");
  try {
    // Cont real obligatoriu: anonimii nu pot scrie DM / apela (audit messenger P0).
    const userId = await getAccountUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await rateLimit("dmConversation", userId);
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    const ipRl = await rateLimit("dm_ip", getClientIP(request), ABUSE_LIMITS.dmPerIp);
    if (!ipRl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const rawBody = await request.json().catch(() => ({}));
    const parsed = parseBody(DmConversationCreateSchema, rawBody);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error, issues: parsed.issues }, { status: 400 });
    }
    const peerId = parsed.data.peer_user_id;
    if (peerId === userId) {
      return NextResponse.json({ error: "Cannot DM yourself" }, { status: 400 });
    }

    const { conversationId, isNew } = await getOrCreateDmConversation(userId, peerId);
    const response = NextResponse.json({
      conversation_id: conversationId,
      is_new: isNew,
    });
    return response;
  } catch (err: unknown) {
    logger.error({ err: err }, "[DM] create conversation:");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
