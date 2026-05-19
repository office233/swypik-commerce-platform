import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ username: string }>;
};

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const { username } = await params;
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const limit = Math.min(60, Math.max(12, Number(url.searchParams.get("limit") || 24)));
    const offset = (page - 1) * limit;

    const userRes = await dbQuery<{ id: string }>(
      `SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1`,
      [username.replace(/^@/, "")]
    );
    if (!userRes.rows.length) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const userId = userRes.rows[0].id;

    const rows = await dbQuery<any>(
      `SELECT
        v.id,
        v.title,
        v.description,
        v.thumbnail_url,
        v.duration_ms,
        v.view_count,
        v.like_count,
        v.comment_count,
        v.save_count,
        v.share_count,
        v.published_at
      FROM videos v
      WHERE v.creator_id = $1
        AND v.status = 'ready'
        AND v.visibility = 'public'
        AND EXISTS (SELECT 1 FROM video_effective_safety ves WHERE ves.video_id = v.id AND ves.effective_label = 'safe')
      ORDER BY v.published_at DESC NULLS LAST, v.created_at DESC
      LIMIT $2 OFFSET $3`,
      [userId, limit + 1, offset]
    );

    const hasMore = rows.rows.length > limit;
    const videos = (hasMore ? rows.rows.slice(0, limit) : rows.rows).map((r: any) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      thumbnailUrl: r.thumbnail_url,
      durationMs: r.duration_ms,
      viewCount: Number(r.view_count) || 0,
      likeCount: Number(r.like_count) || 0,
      commentCount: Number(r.comment_count) || 0,
      saveCount: Number(r.save_count) || 0,
      shareCount: Number(r.share_count) || 0,
      publishedAt: r.published_at,
    }));

    return NextResponse.json({ videos, page, hasMore });
  } catch (err) {
    logger.error({ err }, "[User Videos API] GET");
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
