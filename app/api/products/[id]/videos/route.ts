import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

import { logger } from "@/lib/logger";
/**
 * GET /api/products/[id]/videos
 * Public endpoint — returns videos that reference a given product.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: productId } = await params;

  if (!productId) {
    return NextResponse.json({ videos: [] });
  }

  try {
    const { rows } = await dbQuery(
      `SELECT
         v.id,
         v.title,
         v.description,
         v.playback_url,
         v.thumbnail_url,
         v.duration_ms,
         v.view_count,
         v.like_count,
         v.published_at,
         u.display_name AS creator_name,
         u.id            AS creator_id
       FROM videos v
       JOIN users u ON v.creator_id = u.id
       WHERE v.status     = 'ready'
         AND v.visibility = 'public'
         AND v.product_refs @> $1::jsonb
       ORDER BY v.view_count DESC, v.published_at DESC
       LIMIT 10`,
      [JSON.stringify([productId])]
    );

    const videos = rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      playbackUrl: r.playback_url,
      thumbnailUrl: r.thumbnail_url,
      durationSeconds: r.duration_ms ? Math.round(r.duration_ms / 1000) : 0,
      viewCount: Number(r.view_count) || 0,
      likeCount: Number(r.like_count) || 0,
      publishedAt: r.published_at,
      creatorName: r.creator_name,
      creatorId: r.creator_id,
    }));

    return NextResponse.json({ videos });
  } catch (err: any) {
    logger.error({ err: err.message }, "[products/videos] query error:");
    return NextResponse.json({ videos: [] });
  }
}
