import { withErrorHandling } from "@/lib/api-handler";
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getOptionalSocialUserId } from "@/lib/social/session";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  user_id: string;
  actor_user_id: string | null;
  notification_type: string;
  title: string;
  body: string | null;
  video_id: string | null;
  comment_id: string | null;
  action_url: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

async function GET_impl(request: Request) {
  const userId = await getOptionalSocialUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const limitParam = Number(url.searchParams.get("limit") || "20");
  const limit = Math.min(Math.max(limitParam || 20, 1), 50);

  const params: unknown[] = [userId];
  let cursorClause = "";
  if (cursor) {
    cursorClause = ` AND created_at < $2`;
    params.push(cursor);
  }
  params.push(limit + 1);

  const { rows } = await dbQuery<Row>(
    `SELECT id, user_id, actor_user_id, notification_type, title, body,
            video_id, comment_id, action_url, metadata, read_at, created_at
       FROM notifications
      WHERE user_id = $1${cursorClause}
      ORDER BY created_at DESC
      LIMIT $${params.length}`,
    params,
  );

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].created_at : null;

  const { rows: unreadRows } = await dbQuery<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM notifications
      WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );

  return NextResponse.json({
    items,
    nextCursor,
    unreadCount: Number(unreadRows[0]?.count || "0"),
  });
}

export const GET = withErrorHandling(GET_impl);
