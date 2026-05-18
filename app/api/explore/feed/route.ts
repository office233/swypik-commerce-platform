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
const UUID_SQL_RE = "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";
const COMMERCE_BLOCKLIST_SQL_RE = [
  "jock[ -]?strap",
  "g[ -]?strings?",
  "thongs?",
  "open[ -]?butt",
  "see[ -]?through",
  "transparent",
  "lingerie",
  "panties",
  "panty",
  "underwear",
  "underpants",
  "briefs",
  "bralette",
  "bikini",
  "bodysuit",
  "corset",
  "sexy",
  "erotic",
  "adult",
  "fetish",
  "bdsm",
  "anal",
  "vibrator",
  "dildo",
  "condom",
  "nipple",
  "penis",
  "vagina",
  "sissy",
  "chastity",
].join("|");
const DEFAULT_FEED_SOFT_BLOCK_SQL_RE = [
  "underwear",
  "underpants",
  "panties",
  "panty",
  "lingerie",
  "shapewear",
  "body[ -]?shaper",
  "bodysuit",
  "bras?",
  "bralette",
  "briefs",
  "menstrual panties",
  "girdle",
  "corset",
  "bikini",
  "swimwear",
  "nightdress",
  "sleepwear",
  "slip sleep",
].join("|");
const SESSION_RE = /^[A-Za-z0-9._:-]{8,80}$/;
const MEDIA_PUBLIC_HOST = "media.swypik.com";

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

function firstProductRefId(value: unknown): string | null {
  try {
    const refs = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(refs) || refs.length === 0) return null;
    const firstRef = refs[0];
    return typeof firstRef === "string"
      ? firstRef
      : firstRef?.product_id || firstRef?.id || null;
  } catch {
    return null;
  }
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(cents: number | null, currency: string): string | null {
  if (cents == null) return null;
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function toMediaProxyUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === MEDIA_PUBLIC_HOST) {
      return `/media${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return url;
  }
  return url;
}

function clampScore(score: number): number {
  return Math.max(1, Math.min(99, Math.round(score)));
}

function scoreLabel(score: number): string {
  if (score >= 82) return "Merită urmărit";
  if (score >= 68) return "Promițător";
  if (score >= 50) return "De verificat";
  return "Atenție";
}

function computeSwypikScore(row: any): number {
  const worthIt = asNumber(row.worth_it_count) || 0;
  const notWorthIt = asNumber(row.not_worth_it_count) || 0;
  const totalVotes = worthIt + notWorthIt;
  const voteSignal = totalVotes > 0 ? ((worthIt - notWorthIt) / totalVotes) * 18 : 0;

  const engagement =
    (asNumber(row.like_count) || 0) * 2
    + (asNumber(row.save_count) || 0) * 3
    + (asNumber(row.share_count) || 0) * 4
    + (asNumber(row.comment_count) || 0) * 2;
  const engagementSignal = Math.min(12, Math.log10(engagement + 1) * 6);

  const inventory = String(row.mp_inventory_status || "").toLowerCase();
  const inventorySignal = inventory === "in_stock" || inventory === "available" ? 8 : inventory === "out_of_stock" ? -30 : 0;
  const shippingCents = asNumber(row.mp_shipping_cost_cents);
  const shippingSignal = shippingCents === 0 ? 4 : shippingCents && shippingCents > 2500 ? -4 : 0;
  const priceSignal = (asNumber(row.mp_price_cents) || 0) > 0 ? 4 : -10;
  const safetySignal = row.mp_is_adult ? -50 : 0;

  return clampScore(62 + voteSignal + engagementSignal + inventorySignal + shippingSignal + priceSignal + safetySignal);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const sortParam = (searchParams.get("sort") || "recent") as SortMode;
    const sort: SortMode = VALID_SORTS.has(sortParam) ? sortParam : "recent";
    const sourceParam = searchParams.get("source");
    const taxonomySlugParam = (searchParams.get("taxonomy_node_slug") || searchParams.get("category") || "").trim();
    const onlyFollowing = sourceParam === "following";
    const hideSoftCommerce = !taxonomySlugParam && sourceParam !== "following" && searchParams.get("include_soft_commerce") !== "1";

    const pageRaw = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limitRaw = parseInt(searchParams.get("limit") || "20", 10) || 20;
    const limit = Math.min(Math.max(1, limitRaw), 50);
    const page = pageRaw;
    const offset = (page - 1) * limit;

    const publicUrl = (process.env.S3_PUBLIC_URL || process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

    const userId = await getOptionalSocialUserId();
    const rawSessionId = (searchParams.get("session_id") || "").trim();
    const viewerSessionId = SESSION_RE.test(rawSessionId) ? rawSessionId : null;

    // Fetch limit+1 to compute hasMore without COUNT(*)
    const queryLimit = limit + 1;
    const queryParams: any[] = [queryLimit, offset];
    let userParam = "";
    let sessionParam = "";
    let taxonomyParam = "";
    if (userId) {
      queryParams.push(userId);
      userParam = `$${queryParams.length}`;
    }
    if (viewerSessionId) {
      queryParams.push(viewerSessionId);
      sessionParam = `$${queryParams.length}`;
    }
    if (taxonomySlugParam) {
      queryParams.push(taxonomySlugParam);
      taxonomyParam = `$${queryParams.length}`;
    }

    const orderClause = buildOrderClause(sort);
    const scoreSelect =
      sort === "popular"
        ? `, ${ENGAGEMENT_EXPR} AS engagement_score`
        : sort === "trending"
          ? `, ${TRENDING_EXPR} AS trending_score`
          : "";
    const softCommerceClause = hideSoftCommerce ? `
              AND COALESCE(mp.title, '') !~* '${DEFAULT_FEED_SOFT_BLOCK_SQL_RE}'
              AND COALESCE(mp.taxonomy_node_slug, '') !~* '(underwear|lingerie|swimwear)'
    ` : "";

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
        mp.currency    AS mp_currency,
        mp.inventory_status AS mp_inventory_status,
        mp.shipping_cost_cents AS mp_shipping_cost_cents,
        mp.taxonomy_node_slug AS mp_taxonomy_node_slug,
        mp.is_adult    AS mp_is_adult,
        mp.metadata    AS mp_metadata,
        vpl.placement  AS product_placement,
        COALESCE(vpv.worth_it_count, 0)::int AS worth_it_count,
        COALESCE(vpv.not_worth_it_count, 0)::int AS not_worth_it_count,
        ${userId || viewerSessionId ? `vpvv.vote AS viewer_product_vote,` : `NULL::text AS viewer_product_vote,`}
        at.id          AS at_id,
        at.title       AS at_title,
        at.artist      AS at_artist,
        at.image_url   AS at_image_url,
        at.audio_url   AS at_audio_url,
        at.duration_s AS at_duration_s
        ${scoreSelect}
        ${userId ? `,
        EXISTS(SELECT 1 FROM likes l WHERE l.user_id = ${userParam} AND l.video_id = v.id) AS viewer_liked,
        EXISTS(SELECT 1 FROM saves s WHERE s.user_id = ${userParam} AND s.video_id = v.id) AS viewer_saved,
        EXISTS(SELECT 1 FROM follows f WHERE f.follower_user_id = ${userParam} AND f.following_user_id = v.creator_id) AS viewer_following
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
      LEFT JOIN LATERAL (
        SELECT product_id, placement, sort_order
        FROM video_product_links
        WHERE video_id = v.id
        ORDER BY
          CASE placement
            WHEN 'pinned' THEN 0
            WHEN 'overlay' THEN 1
            WHEN 'chapter' THEN 2
            ELSE 3
          END,
          sort_order ASC,
          created_at DESC
        LIMIT 1
      ) vpl ON true
      LEFT JOIN marketplace_products mp
        ON mp.id = COALESCE(
          vpl.product_id,
          CASE
            WHEN COALESCE(v.product_refs->0->>'product_id', v.product_refs->>0) ~* '${UUID_SQL_RE}'
              THEN COALESCE(v.product_refs->0->>'product_id', v.product_refs->>0)::uuid
            ELSE NULL
          END
        )
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE vote = 'worth_it')::int AS worth_it_count,
          COUNT(*) FILTER (WHERE vote = 'not_worth_it')::int AS not_worth_it_count
        FROM video_product_votes
        WHERE video_id = v.id AND product_id = mp.id
      ) vpv ON mp.id IS NOT NULL
      ${userId || viewerSessionId ? `LEFT JOIN LATERAL (
        SELECT vote
        FROM video_product_votes
        WHERE video_id = v.id
          AND product_id = mp.id
          AND (
            ${userId ? `user_id = ${userParam}` : `false`}
            ${viewerSessionId ? `OR (user_id IS NULL AND session_id = ${sessionParam})` : ``}
          )
        ORDER BY CASE WHEN user_id IS NOT NULL THEN 0 ELSE 1 END, updated_at DESC
        LIMIT 1
      ) vpvv ON mp.id IS NOT NULL` : ``}
      LEFT JOIN audio_tracks at ON at.id = v.audio_track_id
      WHERE v.status = 'ready' AND v.is_hidden = false
        AND v.visibility = 'public'
          AND CASE
            WHEN vpl.product_id IS NOT NULL
              OR CASE
                WHEN COALESCE(jsonb_typeof(v.product_refs), 'null') = 'array' THEN jsonb_array_length(v.product_refs) > 0
                ELSE false
              END THEN
              mp.id IS NOT NULL
              AND mp.status = 'active'
              AND COALESCE(mp.is_adult, false) = false
              AND COALESCE(mp.price_cents, 0) > 0
              AND NULLIF(BTRIM(mp.image_url), '') IS NOT NULL
              AND NULLIF(BTRIM(mp.taxonomy_node_slug), '') IS NOT NULL
              AND COALESCE(mp.title, '') !~* '${COMMERCE_BLOCKLIST_SQL_RE}'
              ${softCommerceClause}
            ELSE true
          END
        ${onlyFollowing && userId ? `AND EXISTS (SELECT 1 FROM follows f2 WHERE f2.follower_user_id = ${userParam} AND f2.following_user_id = v.creator_id)` : ''}
        ${userId ? `AND NOT EXISTS (SELECT 1 FROM user_hidden_videos uhv WHERE uhv.user_id = ${userParam} AND uhv.video_id = v.id)` : ''}
      ${taxonomySlugParam ? `AND mp.taxonomy_node_slug IN (
        WITH RECURSIVE descendants AS (
          SELECT slug FROM taxonomy_nodes WHERE slug = ${taxonomyParam}::text
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
        const productId = row.mp_id ? String(row.mp_id) : firstProductRefId(row.product_refs);
        const currency = String(row.mp_currency || "RON").trim().toUpperCase();
        const priceCents = asNumber(row.mp_price_cents);
        const shippingCents = asNumber(row.mp_shipping_cost_cents);
        const worthIt = asNumber(row.worth_it_count) || 0;
        const notWorthIt = asNumber(row.not_worth_it_count) || 0;
        const totalVotes = worthIt + notWorthIt;
        const swypikScore = row.mp_id ? computeSwypikScore(row) : null;

        const sourceUrl = row.source_key && publicUrl ? `${publicUrl}/${row.source_key}` : null;
        const playbackUrl = row.playback_url || sourceUrl;
        const rawUrl = sourceUrl || playbackUrl;
        const url = toMediaProxyUrl(rawUrl);
        const fallbackUrl = sourceUrl && playbackUrl && sourceUrl !== playbackUrl ? toMediaProxyUrl(playbackUrl) : null;

        const isHls = typeof url === 'string' && /\.m3u8(\?|$)/i.test(url);
        const rawThumbnail = row.thumbnail_url
          || (row.source_key && publicUrl ? `${publicUrl}/videos/thumbnails/${row.video_id}.jpg` : null);

        return {
          id: row.video_id,
          url,
          hlsUrl: isHls && !sourceUrl ? url : null,
          fallbackUrl,
          thumbnail: toMediaProxyUrl(rawThumbnail),
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
          product: row.mp_id && productId ? {
            id: productId,
            name: row.mp_name || null,
            title: row.mp_name || null,
            price: priceCents != null ? priceCents / 100 : null,
            priceCents,
            priceDisplay: formatMoney(priceCents, currency),
            currency,
            image: row.mp_image_url || null,
            image_url: row.mp_image_url || null,
            inventoryStatus: row.mp_inventory_status || null,
            taxonomyNodeSlug: row.mp_taxonomy_node_slug || null,
            shippingCents,
            deliveryLabel: shippingCents === 0
              ? "Livrare inclusă"
              : shippingCents
                ? `Livrare ${formatMoney(shippingCents, currency)}`
                : "Livrare la checkout",
            linkPlacement: row.product_placement || "product_refs",
            swypikScore,
            swypikScoreLabel: swypikScore ? scoreLabel(swypikScore) : null,
            votes: {
              worthIt,
              notWorthIt,
              total: totalVotes,
              viewerVote: row.viewer_product_vote || null,
            },
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

      const cacheHeaders = { "Cache-Control": "no-store" };
      return NextResponse.json({ videos, page, hasMore }, { headers: cacheHeaders });
    }

    // No videos available
    const emptyHeaders = { "Cache-Control": "no-store" };
    return NextResponse.json({ videos: [], page, hasMore: false }, { headers: emptyHeaders });
  } catch (error: any) {
    logger.error({ err: error }, "Explore feed API error:");
    return NextResponse.json(
      { error: "Failed to fetch video feed" },
      { status: 500 }
    );
  }
}
