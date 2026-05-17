import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getOptionalSocialUserId } from "@/lib/social/session";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

/**
 * GET /api/explore/feed
 *
 * Pagination via LIMIT+1 (no COUNT(*)). Removed expensive ILIKE '%topic%'
 * interest ranking. TODO: re-add tsvector / pgvector personalization.
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

function buildOrderClause(sort: SortMode): string {
  switch (sort) {
    case "popular":
      return `${ENGAGEMENT_EXPR} DESC, v.published_at DESC NULLS LAST`;
    case "trending":
      return `${TRENDING_EXPR} DESC, v.published_at DESC NULLS LAST`;
    case "recent":
    default:
      return `v.published_at DESC NULLS LAST, v.created_at DESC`;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const sortParam = (searchParams.get("sort") || "recent") as SortMode;
    const sort: SortMode = VALID_SORTS.has(sortParam) ? sortParam : "recent";
    const sourceParam = searchParams.get("source");
    const taxonomySlugParam = (searchParams.get("taxonomy_node_slug") || searchParams.get("category") || "").trim();
    const onlyFollowing = sourceParam === "following";

    const pageRaw = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limitRaw = parseInt(searchParams.get("limit") || "20", 10) || 20;
    const limit = Math.min(Math.max(1, limitRaw), 50);
    const page = pageRaw;
    const offset = (page - 1) * limit;

    const publicUrl = process.env.S3_PUBLIC_URL?.replace(/\/$/, "") || "";

    const userId = await getOptionalSocialUserId();

    // Fetch limit+1 to compute hasMore without COUNT(*)
    const queryLimit = limit + 1;
    const queryParams: any[] = [queryLimit, offset];
    if (userId) queryParams.push(userId);
    if (taxonomySlugParam) queryParams.push(taxonomySlugParam);

    const orderClause = buildOrderClause(sort);
    const scoreSelect =
      sort === "popular"
        ? `, ${ENGAGEMENT_EXPR} AS engagement_score`
        : sort === "trending"
          ? `, ${TRENDING_EXPR} AS trending_score`
          : "";

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
        mp.image_url   AS mp_image_url,
        at.id          AS at_id,
        at.title       AS at_title,
        at.artist      AS at_artist,
        at.image_url   AS at_image_url,
        at.audio_url   AS at_audio_url,
        at.duration_s AS at_duration_s
        ${scoreSelect}
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
      LEFT JOIN audio_tracks at ON at.id = v.audio_track_id
      WHERE v.status = 'ready' AND v.is_hidden = false
        AND v.visibility = 'public'
        ${onlyFollowing && userId ? `AND EXISTS (SELECT 1 FROM follows f2 WHERE f2.follower_user_id = $3 AND f2.following_user_id = v.creator_id)` : ''}
        AND NOT EXISTS (SELECT 1 FROM user_hidden_videos uhv WHERE uhv.user_id = ${userId ? '$3' : "'00000000-0000-0000-0000-000000000000'::uuid"} AND uhv.video_id = v.id)
      ${taxonomySlugParam ? `AND mp.taxonomy_node_slug IN (
        WITH RECURSIVE descendants AS (
          SELECT slug FROM taxonomy_nodes WHERE slug = $${userId ? 4 : 3}::text
          UNION ALL
          SELECT n.slug FROM taxonomy_nodes n JOIN descendants d ON n.parent_slug = d.slug
        ) SELECT slug FROM descendants
      )` : ''}
      ORDER BY ${orderClause}
      LIMIT $1 OFFSET $2`,
      queryParams
    );

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;

    if (sliced.length > 0) {
      const videos = sliced.map((row: any) => {
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

        const url = row.playback_url
          || (row.source_key && publicUrl ? `${publicUrl}/${row.source_key}` : null);

        const isHls = typeof url === 'string' && /\.m3u8(\?|$)/i.test(url);

        return {
          id: row.video_id,
          url,
          hlsUrl: isHls ? url : null,
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
          audioTrack: row.at_id ? {
            id: String(row.at_id),
            title: row.at_title || null,
            artist: row.at_artist || null,
            image_url: row.at_image_url || null,
            audio_url: row.at_audio_url || null,
            duration_s: row.at_duration_s != null ? Number(row.at_duration_s) : null,
          } : null,
          ...(row.engagement_score !== undefined && { engagementScore: Number(row.engagement_score) }),
          ...(row.trending_score !== undefined && { trendingScore: Number(row.trending_score) }),
        };
      });

      const cacheHeaders = userId
        ? { "Cache-Control": "private, no-store" }
        : { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" };
      return NextResponse.json({ videos, page, hasMore }, { headers: cacheHeaders });
    }

    // Fallback: creator_videos legacy
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
      audioTrack: null,
      product: row.product_id ? {
        id: row.product_id,
        name: row.product_title,
        price: row.product_price_cents ? `${(row.product_price_cents / 100).toFixed(2)} RON` : null,
        image: row.product_image_url,
      } : null,
    }));

    return NextResponse.json(
      { videos, page, hasMore: false },
      { headers: userId
          ? { "Cache-Control": "private, no-store" }
          : { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }
    );
  } catch (error: any) {
    logger.error({ err: error }, "Explore feed API error:");
    return NextResponse.json(
      { error: "Failed to fetch video feed" },
      { status: 500 }
    );
  }
}
