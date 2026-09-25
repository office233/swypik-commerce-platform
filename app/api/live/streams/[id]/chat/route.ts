import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { isUuid } from "@/lib/validation/uuid";
import { LiveChatMessageSchema, parseBody } from "@/lib/validation/schemas";
import { listRecentChat, liveChatSseResponse, parseLastEventId, postLiveChatMessage } from "@/lib/live/chat-stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 5 messages / 10s per user (across all streams)
  const rl = await rateLimit("chat", `live:${session.userId}`, { limit: 5, window: 10 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "rate_limited", retryAfter: 10 },
      { status: 429, headers: { "Retry-After": "10" } },
    );
  }

  const rawBody = await req.json().catch(() => null);
  const parsedBody = parseBody(LiveChatMessageSchema, rawBody);
  if (!parsedBody.ok) return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  const row = await postLiveChatMessage(id, session.userId, parsedBody.data.message);
  // Stream inexistent sau care nu e live: 404 (înainte: FK error → 500).
  if (!row) return NextResponse.json({ error: "stream_not_live" }, { status: 404 });
  return NextResponse.json({ id: row.id, created_at: row.created_at });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const url = new URL(req.url);
  const accept = req.headers.get("accept") || "";
  // SSE: realtime prin Redis pub/sub (orice replică) + catch-up din DB.
  if (accept.includes("text/event-stream")) {
    const lastEventId = parseLastEventId(req.headers.get("last-event-id") || url.searchParams.get("lastEventId"));
    return liveChatSseResponse(id, lastEventId, req.signal);
  }
  // Plain JSON list (recent)
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
  return NextResponse.json({ items: await listRecentChat(id, limit) });
}
