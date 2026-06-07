import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

import { logger } from "@/lib/logger";
/**
 * GET /api/products/[id]/videos
 * Public endpoint — returns videos that reference a given product.
 * product_refs schema: [{"source":"...","product_id":"<uuid>"}] OR legacy ["<uuid>"].
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: productId } = await params;

  if (!productId) {
    return NextResponse.json({ videos: [] });
  }

  type ProductVideoRow = {
    id: string;
    title: string | null;
    description: string | null;
    playback_url: string | null;
    thumbnail_url: string | null;
    duration_ms: number | null;
    view_count: number | string | null;
    like_count: number | string | null;
    published_at: string | Date | null;
    creator_name: string | null;
    creator_id: string;
  };
  try {
    const { rows } = await dbQuery<ProductVideoRow>(
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
         AND v.effective_label = 'safe'
         AND COALESCE(v.is_hidden, false) = false
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(COALESCE(v.product_refs, '[]'::jsonb)) e
           WHERE (e ? 'product_id' AND e->>'product_id' = $1)
              OR (jsonb_typeof(e) = 'string' AND e #>> '{}' = $1)
         )
       ORDER BY v.view_count DESC NULLS LAST, v.published_at DESC NULLS LAST
       LIMIT 12`,
      [productId]
    );

    const videos = rows.map((r) => ({
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
  } catch (err) {
    logger.error({ err }, "[products/videos] query error:");
    return NextResponse.json({ videos: [] });
  }
}
