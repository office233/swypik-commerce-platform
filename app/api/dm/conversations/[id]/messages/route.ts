import { NextResponse } from "next/server";
import { frozenResponse, isEnabled } from "@/lib/feature-flags";
import {
  getOptionalSocialUserId,
  getOrCreateSocialUser,
  setAnonSessionCookie,
} from "@/lib/social/session";
import {
  listMessages,
  sendMessage,
  getPeerUserId,
} from "@/lib/dm/repository";
import { notifyUser } from "@/lib/notifications/dispatch";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

/** GET /api/dm/conversations/[id]/messages?before=&limit= */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isEnabled("dm")) return frozenResponse("dm");
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
  } catch (err: any) {
    if (err?.status === 403) {
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
  if (!isEnabled("dm")) return frozenResponse("dm");
  try {
    const session = await getOrCreateSocialUser();
    const userId = session.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: conversationId } = await params;
    const body = await request.json().catch(() => ({}));

    const text = String(body?.body || "");
    if (!text.trim()) {
      return NextResponse.json({ error: "body required" }, { status: 400 });
    }

    const message = await sendMessage(userId, conversationId, {
      body: text,
      mediaUrl: body?.media_url || null,
      replyToMessageId: body?.reply_to_message_id || null,
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
    } catch (e: any) {
      console.error("[DM] notify peer failed:", e?.message || e);
    }

    const response = NextResponse.json({ message });
    setAnonSessionCookie(response, session.anonSessionId);
    return response;
  } catch (err: any) {
    if (err?.status === 400) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err?.status === 403) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    logger.error({ err: err }, "[DM] send message:");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
