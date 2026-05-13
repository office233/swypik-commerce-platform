import { getOptionalSocialUserId } from "@/lib/social/session";
import { assertParticipant } from "@/lib/dm/repository";
import { createSubscriber } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dm/stream/[id] — SSE stream of new messages for a conversation.
 *
 * Subscribes to redis channel `dm:conv:<id>` and forwards each payload as
 * `data: <json>\n\n`. Auth: viewer must be a participant.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getOptionalSocialUserId();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id: conversationId } = await params;
  const ok = await assertParticipant(conversationId, userId);
  if (!ok) {
    return new Response("Forbidden", { status: 403 });
  }

  const channel = `dm:conv:${conversationId}`;
  const encoder = new TextEncoder();
  const subscriber = createSubscriber();

  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // controller closed
        }
      };

      const onMessage = (chan: string, message: string) => {
        if (chan !== channel) return;
        safeEnqueue(`data: ${message}\n\n`);
      };

      subscriber.on("message", onMessage);
      subscriber.on("error", (err) => {
        console.error("[dm/stream] subscriber error:", err?.message || err);
      });

      try {
        await subscriber.subscribe(channel);
      } catch (err: any) {
        console.error("[dm/stream] subscribe failed:", err?.message || err);
        safeEnqueue(`event: error\ndata: ${JSON.stringify({ message: "subscribe failed" })}\n\n`);
        controller.close();
        return;
      }

      safeEnqueue(`event: ready\ndata: ${JSON.stringify({ channel })}\n\n`);
      heartbeat = setInterval(() => safeEnqueue(`: ping\n\n`), 25_000);
    },
    async cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      try {
        await subscriber.unsubscribe(channel);
      } catch {}
      try {
        await subscriber.quit();
      } catch {}
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
