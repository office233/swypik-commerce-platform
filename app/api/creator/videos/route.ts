import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getCreatorUserId } from "@/lib/creator/session";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

/**
 * GET /api/creator/videos
 *
 * Returns the authenticated creator's video library from the `videos` table
 * (migration 0001 schema), joined with video_assets for source info.
 */
export async function GET() {
  try {
    const creatorId = await getCreatorUserId();
    if (!creatorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    type CreatorVideoRow = {
      id: string;
      status: string;
      title: string | null;
      description: string | null;
      video_url: string | null;
      thumbnail_url: string | null;
      duration_ms: number | null;
      product_refs: unknown;
      visibility: string;
      view_count: number | string | null;
      created_at: string | Date;
      product_id: string | null;
      product_title: string | null;
      product_image: string | null;
      source_object_key: string | null;
      source_public_url: string | null;
      asset_status: string | null;
    };
    const { rows } = await dbQuery<CreatorVideoRow>(
      `
      SELECT 
        v.id,
        v.status,
        v.title,
        v.description,
        v.playback_url   AS video_url,
        v.thumbnail_url,
        v.duration_ms,
        v.product_refs,
        v.visibility,
        v.view_count,
        v.created_at,
        pref.product_id,
        p.title          AS product_title,
        p.image_url      AS product_image,
        va.object_key     AS source_object_key,
        va.public_url     AS source_public_url,
        va.status         AS asset_status
      FROM videos v
      LEFT JOIN LATERAL (
        SELECT COALESCE(v.product_refs->0->>'product_id', v.product_refs->>0) AS product_id
        WHERE jsonb_typeof(v.product_refs) = 'array' AND jsonb_array_length(v.product_refs) > 0
      ) pref ON true
      LEFT JOIN marketplace_products p ON p.id::text = pref.product_id
      LEFT JOIN LATERAL (
        SELECT object_key, public_url, status
        FROM video_assets
        WHERE video_id = v.id AND asset_type = 'source'
        ORDER BY created_at DESC
        LIMIT 1
      ) va ON true
      WHERE v.creator_id = $1
      ORDER BY v.created_at DESC
      LIMIT 50
      `,
      [creatorId]
    );

    const videos = rows.map((r) => {
      let productId: string | null = r.product_id || null;
      try {
        const refs = typeof r.product_refs === "string"
          ? JSON.parse(r.product_refs)
          : r.product_refs;
        if (!productId && Array.isArray(refs) && refs.length > 0) {
          const firstRef = refs[0] as string | { product_id?: string; id?: string } | null;
          productId = typeof firstRef === "string"
            ? firstRef
            : firstRef?.product_id || firstRef?.id || null;
        }
      } catch { /* ignore */ }

      return {
        id: r.id,
        status: r.status,
        video_url: r.video_url,
        description: r.description || r.title,
        created_at: r.created_at,
        product_title: r.product_title || null,
        product_id: productId,
        product_image: r.product_image || null,
        duration_ms: r.duration_ms,
        visibility: r.visibility,
        view_count: r.view_count,
      };
    });

    return NextResponse.json({ videos });
  } catch (error) {
    logger.error({ err: error }, "Creator Videos API Error:");
    return NextResponse.json(
      { error: "Failed to fetch creator videos" },
      { status: 500 }
    );
  }
}
