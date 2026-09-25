import { NextResponse } from "next/server";
import { frozenResponse, isEnabled } from "@/lib/feature-flags";
import {
  getOptionalSocialUserId,
  getAccountUserId,
} from "@/lib/social/session";
import {
  listMessages,
  sendMessage,
  getPeerUserId,
  isStatusError,
} from "@/lib/dm/repository";
import { notifyUser } from "@/lib/notifications/dispatch";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { ABUSE_LIMITS } from "@/lib/security/abuse-limits";
import { DmMessageCreateSchema, parseBody } from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** GET /api/dm/conversations/[id]/messages?before=&limit= */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isEnabled("dm") && !isEnabled("messenger")) return frozenResponse("dm");
  try {
    const userId = await getOptionalSocialUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: conversationId } = await params;
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || 30);
    const before = url.searchParams.get("before");

    const messages = await listMessages(conversationId, userId, {
      limit,
      beforeCursor: before,
    });
    return NextResponse.json({ messages });
  } catch (err: unknown) {
    if (isStatusError(err) && err.status === 403) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    logger.error({ err: err }, "[DM] list messages:");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** POST /api/dm/conversations/[id]/messages { body, media_url?, reply_to_message_id? } */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isEnabled("dm") && !isEnabled("messenger")) return frozenResponse("dm");
  try {
    // Cont real obligatoriu: anonimii nu pot scrie DM / apela (audit messenger P0).
    const userId = await getAccountUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: conversationId } = await params;

    const rl = await rateLimit("dmMessage", userId);
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    const ipRl = await rateLimit("dm_ip", getClientIP(request), ABUSE_LIMITS.dmPerIp);
    if (!ipRl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const rawBody = await request.json().catch(() => ({}));
    const parsed = parseBody(DmMessageCreateSchema, rawBody);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error, issues: parsed.issues }, { status: 400 });
    }
    const { body: text, media_url: mediaUrl, reply_to_message_id: replyToMessageId } = parsed.data;

    const message = await sendMessage(userId, conversationId, {
      body: text,
      mediaUrl: mediaUrl ?? null,
      replyToMessageId: replyToMessageId ?? null,
    });

    // Notify the peer (best-effort).
    try {
      const peerId = await getPeerUserId(conversationId, userId);
      if (peerId) {
        await notifyUser(peerId, {
          type: "system",
          actorUserId: userId,
          payload: {
            title: "Mesaj nou",
            body: text.slice(0, 80),
            url: `/dm/${conversationId}`,
          },
        });
      }
    } catch (e: unknown) {
      logger.error({ err: e }, "[DM] notify peer failed");
    }

    const response = NextResponse.json({ message });
    return response;
  } catch (err: unknown) {
    if (isStatusError(err) && err.status === 400) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (isStatusError(err) && err.status === 403) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    logger.error({ err: err }, "[DM] send message:");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
