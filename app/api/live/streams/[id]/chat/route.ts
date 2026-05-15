import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const message = String(body.message || "").trim().slice(0, 500);
  if (!message) return NextResponse.json({ error: "empty" }, { status: 400 });
  const { rows } = await dbQuery<{ id: number; created_at: string }>(
    `INSERT INTO live_chat_messages (stream_id, user_id, message) VALUES ($1,$2,$3)
     RETURNING id, created_at`,
    [params.id, session.userId, message],
  );
  return NextResponse.json({ id: rows[0].id, created_at: rows[0].created_at });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const accept = req.headers.get("accept") || "";
  // SSE long-poll mode
  if (accept.includes("text/event-stream")) {
    const lastEventId = req.headers.get("last-event-id") || url.searchParams.get("lastEventId");
    const encoder = new TextEncoder();
    const streamId = params.id;
    let lastId = lastEventId ? Number(lastEventId) : 0;
    let closed = false;
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(":ok\n\n"));
        const tick = async () => {
          if (closed) return;
          try {
            const { rows } = await dbQuery<{ id: number; user_id: string; message: string; created_at: string }>(
              `SELECT id, user_id, message, created_at FROM live_chat_messages
                WHERE stream_id = $1 AND id > $2 ORDER BY id ASC LIMIT 100`,
              [streamId, lastId],
            );
            for (const r of rows) {
              lastId = r.id;
              const data = JSON.stringify(r);
              controller.enqueue(encoder.encode(`id: ${r.id}\nevent: chat\ndata: ${data}\n\n`));
            }
          } catch (e) {
            // ignore
          }
        };
        const interval = setInterval(tick, 1500);
        await tick();
        req.signal.addEventListener("abort", () => {
          closed = true;
          clearInterval(interval);
          try { controller.close(); } catch {}
        });
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }
  // Plain JSON list (recent)
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);
  const { rows } = await dbQuery(
    `SELECT id, user_id, message, created_at FROM live_chat_messages
       WHERE stream_id = $1 ORDER BY id DESC LIMIT $2`,
    [params.id, limit],
  );
  return NextResponse.json({ items: rows.reverse() });
}
