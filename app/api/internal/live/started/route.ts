import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { sendPushToUser } from "@/lib/push/web-push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function verifyInternal(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_SECRET;
  if (!secret) return false;
  const got = req.headers.get("x-internal");
  return got === secret;
}

function extractKey(path: string): string | null {
  // expected forms: "live/<key>" or "live/<key>/..."
  const m = path.match(/^live\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

export async function POST(req: NextRequest) {
  if (!verifyInternal(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const json = form ? null : await req.json().catch(() => ({}));
  const path = String(form?.get("path") ?? (json as any)?.path ?? "");
  const streamKey = extractKey(path);
  if (!streamKey) return NextResponse.json({ error: "invalid_path" }, { status: 400 });

  const { rows } = await dbQuery<{ id: string; creator_id: string; title: string }>(
    `UPDATE live_streams SET status = 'live', started_at = COALESCE(started_at, now())
       WHERE stream_key = $1 RETURNING id, creator_id, title`,
    [streamKey],
  );
  if (!rows[0]) return NextResponse.json({ error: "stream_not_found" }, { status: 404 });
  const stream = rows[0];

  // Notify followers
  try {
    const { rows: followers } = await dbQuery<{ follower_user_id: string }>(
      `SELECT follower_user_id FROM follows WHERE following_user_id::text = $1
         AND notification_level <> 'none'`,
      [stream.creator_id],
    );
    for (const f of followers) {
      try {
        await dbQuery(
          `INSERT INTO notifications (user_id, actor_user_id, notification_type, title, body, action_url, metadata)
             VALUES ($1::uuid, $2::uuid, 'creator_live', $3, $4, $5, $6::jsonb)`,
          [
            f.follower_user_id,
            stream.creator_id,
            `A început un LIVE`,
            stream.title,
            `/live/${stream.id}`,
            JSON.stringify({ stream_id: stream.id }),
          ],
        );
        try {
          await sendPushToUser(f.follower_user_id, {
            title: "LIVE pe Swypik",
            body: stream.title,
            url: `/live/${stream.id}`,
          });
        } catch {}
      } catch {}
    }
  } catch (e) {
    console.warn("[live/started] notify failed", e);
  }

  return NextResponse.json({ ok: true, stream_id: stream.id });
}
