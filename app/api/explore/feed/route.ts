import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getOptionalSocialUserId } from "@/lib/social/session";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

/**
 * GET /api/explore/feed
 *
 * Query params:
 *   sort  – "recent" (default) | "popular" | "trending"
 *   page  – page number (default 1)
 *   limit – items per page (default 20, max 50)
 *
 * Primary: read from video_assets + videos (migration 0001 schema).
 * Fallback: read from creator_videos (legacy table).
 *
 * Schema (0001):
 *   videos:       creator_id, title, description, product_refs, playback_url, thumbnail_url,
 *                 view_count, like_count, share_count, comment_count, published_at, created_at
 *   video_assets: video_id, asset_type, object_key, status, duration_ms
 */

type SortMode = "recent" | "popular" | "trending";

const VALID_SORTS = new Set<SortMode>(["recent", "popular", "trending"]);

const ENGAGEMENT_EXPR = `(
  COALESCE(v.view_count, 0) * 1
  + COALESCE(v.like_count, 0) * 5
  + COALESCE(v.share_count, 0) * 10
  + COALESCE(v.comment_count, 0) * 3
)`;

const TRENDING_EXPR = `(
  (COALESCE(v.view_count, 0) * 1
   + COALESCE(v.like_count, 0) * 5
   + COALESCE(v.share_count, 0) * 10
   + COALESCE(v.comment_count, 0) * 3)
  / GREATEST(1, EXTRACT(EPOCH FROM (NOW() - COALESCE(v.published_at, v.created_at))) / 3600)
)`;

function buildOrderClause(sort: SortMode, interestBonusExpr: string = '0'): string {
  const bonus = interestBonusExpr !== '0' ? ` + (${interestBonusExpr} * 2)` : '';
  switch (sort) {
    case "popular":
      return `(${ENGAGEMENT_EXPR}${bonus}) DESC`;
    case "trending":
      return `(${TRENDING_EXPR}${bonus}) DESC`;
    case "recent":
    default:
      if (interestBonusExpr !== '0') {
         return `(${interestBonusExpr} * 2) DESC, v.published_at DESC NULLS LAST, v.created_at DESC`;
      }
      return `v.published_at DESC NULLS LAST, v.created_at DESC`;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    // --- Parse & validate query params ---
    const sortParam = (searchParams.get("sort") || "recent") as SortMode;
    const sort: SortMode = VALID_SORTS.has(sortParam) ? sortParam : "recent";
    const sourceParam = searchParams.get("source");
    const onlyFollowing = sourceParam === "following";

    const pageRaw = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limitRaw = parseInt(searchParams.get("limit") || "20", 10) || 20;
    const limit = Math.min(Math.max(1, limitRaw), 50);
    const page = pageRaw;
    const offset = (page - 1) * limit;

    const publicUrl = process.env.S3_PUBLIC_URL?.replace(/\/$/, "") || "";

    // --- Get social user ID from session, resolving customer sessions when present ---
    const userId = await getOptionalSocialUserId();

    // --- Total count for pagination ---
    const countResult = await dbQuery(
      `SELECT COUNT(*) FROM videos WHERE status = 'ready' AND visibility = 'public'`
    );
    const totalCount = parseInt(countResult.rows[0]?.count ?? "0", 10);

    // --- Primary query: videos + video_assets (0001 schema) ---
    let interestScoreExpr = '0';
    const queryParams: any[] = [limit, offset];
    
    if (userId) {
      queryParams.push(userId);
      interestScoreExpr = `COALESCE((
        SELECT SUM(ui.weight)
        FROM user_interests ui
        WHERE ui.user_id = $3
          AND (v.description ILIKE '%' || ui.topic || '%' 
               OR v.title ILIKE '%' || ui.topic || '%')
      ), 0)`;
    }

    const orderClause = buildOrderClause(sort, interestScoreExpr);
    const scoreSelect =
      sort === "popular"
        ? `, ${ENGAGEMENT_EXPR} AS engagement_score`
        : sort === "trending"
          ? `, ${TRENDING_EXPR} AS trending_score`
          : "";
          
    const interestSelect = userId ? `, ${interestScoreExpr} AS interest_score` : `, 0 AS interest_score`;

    const { rows } = await dbQuery(
      `SELECT 
        v.id          AS video_id,
        v.creator_id,
        v.title,
        v.description,
        v.playback_url,
        v.thumbnail_url,
        v.duration_ms,
        v.product_refs,
        v.view_count,
        v.like_count,
        v.save_count,
        v.share_count,
        v.comment_count,
        u.display_name AS creator_name,
        u.username     AS creator_username,
        u.is_verified  AS creator_verified,
        u.avatar_url   AS creator_avatar,
        va.object_key  AS source_key,
        va.status      AS asset_status,
        mp.id          AS mp_id,
        mp.title       AS mp_name,
        mp.price_cents AS mp_price_cents,
        mp.image_url   AS mp_image_url
        ${scoreSelect}
        ${interestSelect}
        ${userId ? `,
        EXISTS(SELECT 1 FROM likes l WHERE l.user_id = $3 AND l.video_id = v.id) AS viewer_liked,
        EXISTS(SELECT 1 FROM saves s WHERE s.user_id = $3 AND s.video_id = v.id) AS viewer_saved,
        EXISTS(SELECT 1 FROM follows f WHERE f.follower_user_id = $3 AND f.following_user_id = v.creator_id) AS viewer_following
        ` : `,
        false AS viewer_liked,
        false AS viewer_saved,
        false AS viewer_following
        `}
      FROM videos v
      LEFT JOIN users u ON v.creator_id = u.id
      LEFT JOIN LATERAL (
        SELECT object_key, status
        FROM video_assets
        WHERE video_id = v.id AND asset_type = 'source'
        ORDER BY created_at DESC
        LIMIT 1
      ) va ON true
      LEFT JOIN marketplace_products mp
        ON mp.id::text = (v.product_refs->0->>'product_id')
      WHERE v.status = 'ready'
        AND v.visibility = 'public'
        ${onlyFollowing && userId ? `AND EXISTS (SELECT 1 FROM follows f2 WHERE f2.follower_user_id = $3 AND f2.following_user_id = v.creator_id)` : ''}
        AND NOT EXISTS (SELECT 1 FROM user_hidden_videos uhv WHERE uhv.user_id = ${userId ? '$3' : "'00000000-0000-0000-0000-000000000000'::uuid"} AND uhv.video_id = v.id)
      ORDER BY ${orderClause}
      LIMIT $1 OFFSET $2`,
      queryParams
    );

    if (rows.length > 0 || totalCount > 0) {
      const videos = rows.map((row: any) => {
        // Extract first product_id from product_refs JSONB array
        let productId: string | null = null;
        try {
          const refs = typeof row.product_refs === "string"
            ? JSON.parse(row.product_refs)
            : row.product_refs;
          if (Array.isArray(refs) && refs.length > 0) {
            const firstRef = refs[0];
            productId = typeof firstRef === "string"
              ? firstRef
              : firstRef?.product_id || firstRef?.id || null;
          }
        } catch { /* ignore */ }

        // Build video URL: prefer playback_url, fallback to R2 object_key
        const url = row.playback_url
          || (row.source_key && publicUrl ? `${publicUrl}/${row.source_key}` : null);

        return {
          id: row.video_id,
          url,
          hlsUrl: null, // HLS not yet implemented
          thumbnail: row.thumbnail_url
            || (row.source_key && publicUrl ? `${publicUrl}/videos/thumbnails/${row.video_id}.jpg` : null),
          duration: row.duration_ms ? Math.round(row.duration_ms / 1000) : null,
          creator: { id: row.creator_id, name: row.creator_name || row.creator_username || "Creator", username: row.creator_username || null, verified: Boolean(row.creator_verified), avatar: row.creator_avatar || null },
          description: row.description || "",
          likes: String(row.like_count || 0),
          saves: String(row.save_count || 0),
          shares: String(row.share_count || 0),
          comments: String(row.comment_count || 0),
          viewer: {
            liked: Boolean(row.viewer_liked),
            saved: Boolean(row.viewer_saved),
            following: Boolean(row.viewer_following),
          },
          product: productId ? {
            id: productId,
            name: row.mp_name || null,
            price: row.mp_price_cents ? `${(row.mp_price_cents / 100).toFixed(2)} RON` : null,
            image: row.mp_image_url || null,
          } : null,
          ...(row.engagement_score !== undefined && { engagementScore: Number(row.engagement_score) }),
          ...(row.trending_score !== undefined && { trendingScore: Number(row.trending_score) }),
        };
      });

      const hasMore = offset + rows.length < totalCount;

      return NextResponse.json({ videos, page, totalCount, hasMore });
    }

    // TODO: remove creator_videos fallback after full migration
    const fallback = await dbQuery(`
      SELECT 
        cv.id as video_id,
        cv.creator_id,
        cv.video_url,
        cv.description,
        p.id as product_id,
        p.title as product_title,
        p.price_cents as product_price_cents,
        p.image_url as product_image_url
      FROM creator_videos cv
      JOIN marketplace_products p ON cv.product_id = p.id::text
      WHERE cv.status = 'ready'
      ORDER BY cv.id DESC
      LIMIT 50
    `);

    const videos = fallback.rows.map((row: any) => ({
      id: row.video_id,
      url: row.video_url,
      hlsUrl: null,
      thumbnail: null,
      duration: null,
      creator: { id: row.creator_id, name: "Creator" },
      description: row.description || "",
      likes: "0",
      saves: "0",
      shares: "0",
      comments: "0",
      viewer: { liked: false, saved: false, following: false },
      product: row.product_id ? {
        id: row.product_id,
        name: row.product_title,
        price: row.product_price_cents ? `${(row.product_price_cents / 100).toFixed(2)} RON` : null,
        image: row.product_image_url,
      } : null,
    }));

    return NextResponse.json({ videos });
  } catch (error: any) {
    logger.error({ err: error }, "Explore feed API error:");
    return NextResponse.json(
      { error: "Failed to fetch video feed" },
      { status: 500 }
    );
  }
}
