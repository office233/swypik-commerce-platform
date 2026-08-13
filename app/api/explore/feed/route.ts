import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getOptionalSocialUserId } from "@/lib/social/session";
import { loadFeedWeightsForViewer, type FeedWeights } from "@/lib/algo/scoring";

import { logger } from "@/lib/logger";
import { formatMoneyCents } from "@/lib/i18n/currency";
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
// Scor minim de calitate pentru feed — configurabil fără redeploy de cod.
const DEFAULT_MIN_SWYPIK_SCORE =
  Number(process.env.FEED_MIN_SWYPIK_SCORE) > 0
    ? Math.trunc(Number(process.env.FEED_MIN_SWYPIK_SCORE))
    : 40;

const TITLE_SPAM_RE = /(amazon|hot[ -]?selling|shop products?|must[ -]?have|viral product|dropship|wholesale|factory direct|ce certified|luxury|high[ -]?end|202[5-9])/i;
const TITLE_GENERIC_RE = /\b(woman clothing|women clothing|for women women|female ladies|new fashion|summer sale|spring summer)\b/i;
const BRAND_RISK_RE = /\b(amazon|tiktok|shein|zara|nike|adidas|louis vuitton|gucci|prada|chanel)\b/i;

// 2026-08-11 (audit): ponderile vin din feed_weights (DB) / env FEED_ENG_* /
// defaults (view=1, like=5, share=10, comment=3) — tunabile fără redeploy.
// Valorile sunt numerice, validate în loadFeedWeights (nu user input) — safe în SQL.
function buildEngagementExpr(w: { eng_view: number; eng_like: number; eng_share: number; eng_comment: number }): string {
  return `(
  COALESCE(v.view_count, 0) * ${w.eng_view}
  + COALESCE(v.like_count, 0) * ${w.eng_like}
  + COALESCE(v.share_count, 0) * ${w.eng_share}
  + COALESCE(v.comment_count, 0) * ${w.eng_comment}
)`;
}

function buildTrendingExpr(w: { eng_view: number; eng_like: number; eng_share: number; eng_comment: number }): string {
  return `(
  ${buildEngagementExpr(w)}
  / GREATEST(1, EXTRACT(EPOCH FROM (NOW() - COALESCE(v.published_at, v.created_at))) / 3600)
)`;
}



// Ranking from real engagement events (last 14 days). Scored per video.
// Mirrors /api/feed/recommendations weights.
// ANTI-FRAUD (2026-08-09): semnalele puternice (save/share/like/purchase/
// add_to_cart/comment/follow) se numără DOAR de la utilizatori autentificați
// (actor_user_id IS NOT NULL) și DEDUPLICAT per user — telemetria anonimă
// injectabilă în masă nu mai poate umfla ranking-ul (audit vuln. #9).
const RANK_SCORE_EXPR = `(
  SELECT (
      CASE WHEN v.duration_ms IS NULL OR v.duration_ms <= 0 THEN 0 ELSE LEAST(COALESCE(SUM(fe.watch_ms)::numeric, 0) / v.duration_ms, 50) END * 5
    + COUNT(DISTINCT fe.actor_user_id) FILTER (WHERE fe.event_type = 'save'  AND fe.actor_user_id IS NOT NULL) * 3
    + COUNT(DISTINCT fe.actor_user_id) FILTER (WHERE fe.event_type = 'share' AND fe.actor_user_id IS NOT NULL) * 2
    + COUNT(DISTINCT fe.actor_user_id) FILTER (WHERE fe.event_type = 'like'  AND fe.actor_user_id IS NOT NULL) * 1.5
    + COUNT(*) FILTER (WHERE fe.event_type = 'completion')     * 5
    + COUNT(DISTINCT fe.actor_user_id) FILTER (WHERE fe.event_type = 'add_to_cart' AND fe.actor_user_id IS NOT NULL) * 4
    + COUNT(DISTINCT fe.actor_user_id) FILTER (WHERE fe.event_type = 'purchase'    AND fe.actor_user_id IS NOT NULL) * 8
    + COUNT(*) FILTER (WHERE fe.event_type = 'more_like_this') * 4
    + COUNT(*) FILTER (WHERE fe.event_type = 'product_click')  * 1
    + COUNT(DISTINCT fe.actor_user_id) FILTER (WHERE fe.event_type = 'comment' AND fe.actor_user_id IS NOT NULL) * 4
    + COUNT(DISTINCT fe.actor_user_id) FILTER (WHERE fe.event_type = 'follow'  AND fe.actor_user_id IS NOT NULL) * 4
    - COUNT(*) FILTER (WHERE fe.event_type = 'skip_fast')      * 4
    - COUNT(*) FILTER (WHERE fe.event_type = 'not_interested') * 6
    - COUNT(*) FILTER (WHERE fe.event_type = 'report')         * 10
  )
  FROM feed_events fe
  WHERE fe.video_id = v.id
    AND fe.occurred_at > NOW() - INTERVAL '14 days'
)`;

// Freshness bonus: declines over 3 days. Boost in [0..5].
const FRESHNESS_EXPR = `GREATEST(0, 5 - EXTRACT(EPOCH FROM (NOW() - COALESCE(v.published_at, v.created_at))) / (86400.0 * 3))`;

// Cap real engagement score so a single hot video can't dominate the top.
// We use sqrt+log compression: rank_score=38 → ~12, rank_score=200 → ~16.
// This keeps signal direction but flattens magnitude so jitter actually rotates the top.
const RANK_CAPPED_EXPR = `(LN(GREATEST(COALESCE(vr.rank_score, 0), 0) + 1) * 4)`;

// Exploration: every row gets a random boost so the feed isn't deterministic.
// Magnitude tuned to overlap with capped rank so even #1 rotates across requests.
// Range: ~[0..15] regardless of rank tier.
const EXPLORATION_EXPR = `(random() * 15)`;

// Uses pre-aggregated video_rank_14d (refreshed every ~5min by /api/cron/refresh-rank).
// Falls back to inline RANK_SCORE_EXPR subquery if mat view row missing (new video).
// Wrapped through RANK_CAPPED_EXPR so a single outlier can't pin position #1.
const RANK_FROM_MV = `${RANK_CAPPED_EXPR}`;

// Repetition penalty: -50 if viewer already saw this video in last 24h.
// Injected only when userId or sessionId present (see buildPenaltyExpr below).
function buildPenaltyExpr(hasUser: boolean, hasSession: boolean): string {
  if (!hasUser && !hasSession) return "0";
  const conds: string[] = [];
  if (hasUser) conds.push("rep_user.actor_user_id IS NOT NULL");
  if (hasSession) conds.push("rep_sess.session_id IS NOT NULL");
  return `(CASE WHEN ${conds.join(" OR ")} THEN -50 ELSE 0 END)`;
}

// Personalization: +rank_score boost when video's product matches viewer's preferred categories.
function buildAffinityExpr(hasUser: boolean): string {
  if (!hasUser) return "0";
  return `(COALESCE(uca.affinity_boost, 0))`;
}

// 2026-08-11: personalizare SEMANTICĂ (pgvector). "Gustul" viewerului =
// media embeddings-urilor clipurilor cu semnal pozitiv (like/save/share/
// completion) din ultimele 7 zile. Similaritatea cosine cu clipul curent
// devine boost în [0..w_taste]. Zero-cost când nu există embeddings
// (COALESCE → 0) — se activează singură când embed-batch populează vectorii.
function buildTasteExpr(hasUser: boolean, userParam: string, wTaste: number): string {
  if (!hasUser || !Number.isFinite(wTaste) || wTaste <= 0) return "0";
  return `(COALESCE((
    SELECT (1 - (v.embedding <=> taste.vec)) * ${wTaste}
      FROM (
        SELECT AVG(v_t.embedding) AS vec
          FROM feed_events fe_t
          JOIN videos v_t ON v_t.id = fe_t.video_id
         WHERE fe_t.actor_user_id = ${userParam}::uuid
           AND fe_t.event_type IN ('like','save','share','completion')
           AND fe_t.occurred_at > NOW() - INTERVAL '7 days'
           AND v_t.embedding IS NOT NULL
      ) taste
     WHERE taste.vec IS NOT NULL AND v.embedding IS NOT NULL
  ), 0))`;
}

function buildOrderClause(
  sort: SortMode,
  hasUser: boolean,
  hasSession: boolean,
  equityExpr: string,
  engagementExpr: string,
  trendingExpr: string,
  tasteExpr: string,
): string {
  const penalty = buildPenaltyExpr(hasUser, hasSession);
  const affinity = buildAffinityExpr(hasUser);
  switch (sort) {
    case "popular":
      return `${engagementExpr} + ${penalty} + ${equityExpr} + (random() * 3) DESC, v.published_at DESC NULLS LAST, random()`;
    case "trending":
      return `${trendingExpr} + ${penalty} + ${equityExpr} + (random() * 3) DESC, v.published_at DESC NULLS LAST, random()`;
    case "recent":
    default:
      // Real engagement (mat view) + freshness + personalization - repetition penalty + exploration jitter.
      // Final tie-breaker random() so videos with identical scores don't always
      // appear in the same order across requests.
      return `${RANK_FROM_MV} + ${FRESHNESS_EXPR} + ${affinity} + ${tasteExpr} + ${penalty} + ${equityExpr} + ${EXPLORATION_EXPR} DESC, v.published_at DESC NULLS LAST, random()`;
  }
}

/**
 * REGULI DE DISTRIBUȚIE ECHITABILĂ (FRONT 3, cerință de business):
 *  1. Boost clipuri < small_creator_hours (48h) de la creatori mici
 *     (< small_creator_followers followers).
 *  2. Plafon vizualizări/zi per business: peste daily_views_cap, clipurile
 *     creatorului sunt retrogradate cu daily_cap_penalty pentru restul zilei.
 *  3. Rotație: fiecare clip al aceluiași creator deja servit viewerului azi
 *     penalizează cu rotation_penalty (nu domină aceiași creatori feedul).
 * Ponderile vin din feed_weights / env — vezi lib/algo/scoring.ts.
 */
function buildEquityExpr(w: FeedWeights, hasViewer: boolean): string {
  const n = (v: number) => (Number.isFinite(v) ? String(v) : "0");
  const rotation = hasViewer
    ? `- COALESCE(eq_rot.served_today, 0) * ${n(w.rotation_penalty)}`
    : "";
  return `(
    CASE WHEN COALESCE(eq_cf.follower_count, 0) < ${n(w.small_creator_followers)}
           AND COALESCE(v.published_at, v.created_at) > NOW() - INTERVAL '1 hour' * ${n(w.small_creator_hours)}
         THEN ${n(w.small_creator_boost)} ELSE 0 END
    - CASE WHEN COALESCE(eq_cap.views_today, 0) > ${n(w.daily_views_cap)}
           THEN ${n(w.daily_cap_penalty)} ELSE 0 END
    ${rotation}
  )`;
}

function buildEquityJoins(
  hasUser: boolean,
  hasSession: boolean,
  userParam: string,
  sessionParam: string,
): string {
  const viewerConds: string[] = [];
  if (hasUser) viewerConds.push(`fe_rot.actor_user_id = ${userParam}::uuid`);
  if (hasSession) viewerConds.push(`fe_rot.session_id = ${sessionParam}`);
  const rotationJoin =
    viewerConds.length > 0
      ? `LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT fe_rot.video_id)::int AS served_today
        FROM feed_events fe_rot
        JOIN videos v_rot ON v_rot.id = fe_rot.video_id
        WHERE v_rot.creator_id = v.creator_id
          AND fe_rot.event_type IN ('impression', 'video_view')
          AND fe_rot.occurred_at >= date_trunc('day', NOW())
          AND (${viewerConds.join(" OR ")})
      ) eq_rot ON true`
      : "";
  return `
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS follower_count
        FROM follows f_eq
        WHERE f_eq.following_user_id = v.creator_id
      ) eq_cf ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::bigint AS views_today
        FROM feed_events fe_cap
        JOIN videos v_cap ON v_cap.id = fe_cap.video_id
        WHERE v_cap.creator_id = v.creator_id
          AND fe_cap.event_type = 'video_view'
          AND fe_cap.occurred_at >= date_trunc('day', NOW())
      ) eq_cap ON true
      ${rotationJoin}`;
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
  return formatMoneyCents(cents, currency);
}

// 2026-08-13 (audit): NU mai rescriem catre /media/... — nu exista nicio ruta
// app/media si niciun rewrite in next.config, deci toate URL-urile rescrise
// dadeau 404 => niciun clip nu se incarca in feed. Servim direct URL-ul public
// (S3_PUBLIC_URL / cdn.swypik.com), permis deja in CSP (media-src/connect-src).
function toMediaProxyUrl(url: string | null): string | null {
  return url || null;
}

function clampScore(score: number): number {
  return Math.max(1, Math.min(99, Math.round(score)));
}

function scoreLabel(score: number): string {
  if (score >= 86) return "Merită cumpărat";
  if (score >= 74) return "Merită urmărit";
  if (score >= 62) return "Promițător";
  if (score >= 50) return "De verificat";
  return "Risc ridicat";
}

function metadataNumber(metadata: unknown, keys: string[]): number | null {
  if (!metadata || typeof metadata !== "object") return null;
  for (const key of keys) {
    const value = (metadata as Record<string, unknown>)[key];
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function titleQualitySignals(title: string): { penalty: number; flags: string[] } {
  const normalizedTitle = title.trim();
  const flags: string[] = [];
  let penalty = 0;

  if (normalizedTitle.length > 180) {
    penalty -= 10;
    flags.push("titlu prea lung");
  } else if (normalizedTitle.length > 140) {
    penalty -= 6;
    flags.push("titlu lung");
  }
  if (TITLE_SPAM_RE.test(normalizedTitle)) {
    penalty -= 8;
    flags.push("copy de marketplace");
  }
  if (TITLE_GENERIC_RE.test(normalizedTitle)) {
    penalty -= 4;
    flags.push("titlu generic");
  }
  if (BRAND_RISK_RE.test(normalizedTitle)) {
    penalty -= 7;
    flags.push("brand/risc trust");
  }
  if ((normalizedTitle.match(/\b(women|woman|female|ladies)\b/gi) || []).length >= 4) {
    penalty -= 3;
    flags.push("keyword stuffing");
  }

  return { penalty, flags };
}

type ExploreFeedRow = {
  video_id: string;
  creator_id: string | null;
  title: string | null;
  description: string | null;
  playback_url: string | null;
  thumbnail_url: string | null;
  duration_ms: number | null;
  product_refs: unknown;
  view_count: number | null;
  like_count: number | null;
  save_count: number | null;
  share_count: number | null;
  comment_count: number | null;
  creator_name: string | null;
  creator_username: string | null;
  creator_verified: boolean | null;
  creator_avatar: string | null;
  source_key: string | null;
  asset_status: string | null;
  mp_id: string | null;
  mp_name: string | null;
  mp_price_cents: number | null;
  mp_image_url: string | null;
  mp_currency: string | null;
  mp_inventory_status: string | null;
  mp_shipping_cost_cents: number | null;
  mp_taxonomy_node_slug: string | null;
  mp_is_adult: boolean | null;
  mp_metadata: unknown;
  product_placement: string | null;
  worth_it_count: number;
  not_worth_it_count: number;
  viewer_product_vote: string | null;
  at_id: string | null;
  at_title: string | null;
  at_artist: string | null;
  at_image_url: string | null;
  at_audio_url: string | null;
  at_duration_s: number | string | null;
  post_id: string | null;
  post_slug: string | null;
  post_format: string | null;
  post_title: string | null;
  post_vote_count: number | null;
  post_ends_at: string | null;
  mission_id: string | null;
  mission_title: string | null;
  mission_slug: string | null;
  viewer_liked: boolean;
  viewer_saved: boolean;
  viewer_following: boolean;
  engagement_score?: number;
  trending_score?: number;
};

function computeSwypikScoreDetails(row: ExploreFeedRow): { score: number; reasons: string[]; riskFlags: string[] } {
  const metadata = row.mp_metadata || {};
  const productTitle = String(row.mp_name || "");
  const reasons: string[] = [];
  const riskFlags: string[] = [];

  const worthIt = asNumber(row.worth_it_count) || 0;
  const notWorthIt = asNumber(row.not_worth_it_count) || 0;
  const totalVotes = worthIt + notWorthIt;
  const voteSignal = totalVotes > 0 ? ((worthIt - notWorthIt) / Math.max(3, totalVotes)) * 18 : 0;
  if (totalVotes > 0) reasons.push(`${Math.round((worthIt / totalVotes) * 100)}% comunitate`);

  const engagement =
    (asNumber(row.like_count) || 0) * 2
    + (asNumber(row.save_count) || 0) * 3
    + (asNumber(row.share_count) || 0) * 4
    + (asNumber(row.comment_count) || 0) * 2;
  const engagementSignal = Math.min(10, Math.log10(engagement + 1) * 5);

  const rating = metadataNumber(metadata, ["rating", "rating_avg", "average_rating"]);
  const orders = metadataNumber(metadata, ["orders_count", "orders", "sales_count", "sold"]);
  const reviews = metadataNumber(metadata, ["review_count", "reviews_count", "reviews"]);

  let ratingSignal = -3;
  if (rating != null && rating > 0) {
    if (rating >= 4.8) ratingSignal = 8;
    else if (rating >= 4.5) ratingSignal = 5;
    else if (rating >= 4.2) ratingSignal = 2;
    else if (rating >= 3.8) ratingSignal = -2;
    else ratingSignal = -10;
    reasons.push(`rating ${rating.toFixed(1)}`);
  } else {
    riskFlags.push("fără rating");
  }

  const orderSignal = orders != null && orders > 0 ? Math.min(12, Math.log10(orders + 1) * 4) : -4;
  if (orders != null && orders > 0) reasons.push(`${Math.round(orders)} comenzi`);

  const reviewSignal = reviews != null && reviews > 0 ? Math.min(5, Math.log10(reviews + 1) * 3) : 0;

  const inventory = String(row.mp_inventory_status || "").toLowerCase();
  const inventorySignal = inventory === "in_stock" || inventory === "available" ? 7 : inventory === "out_of_stock" ? -35 : -3;
  const shippingCents = asNumber(row.mp_shipping_cost_cents);
  const priceCents = asNumber(row.mp_price_cents) || 0;
  const shippingRatio = priceCents > 0 && shippingCents != null ? shippingCents / priceCents : null;
  let shippingSignal = 0;
  if (shippingCents === 0) {
    shippingSignal = 4;
    reasons.push("livrare inclusă");
  } else if (shippingRatio != null && shippingRatio > 0.4) {
    shippingSignal = -8;
    riskFlags.push("livrare scumpă");
  } else if (shippingRatio != null && shippingRatio > 0.25) {
    shippingSignal = -5;
  } else if (shippingCents && shippingCents > 2500) {
    shippingSignal = -4;
  } else {
    shippingSignal = 1;
  }

  let priceSignal = priceCents > 0 ? 3 : -12;
  if (priceCents > 100000) priceSignal -= 8;
  else if (priceCents > 50000) priceSignal -= 4;

  const titleSignals = titleQualitySignals(productTitle);
  riskFlags.push(...titleSignals.flags);

  const taxonomySignal = row.mp_taxonomy_node_slug ? 2 : -10;
  const imageSignal = row.mp_image_url ? 2 : -8;
  const safetySignal = row.mp_is_adult ? -60 : 0;
  if (row.mp_is_adult) riskFlags.push("adult");

  const score = clampScore(
    54
    + voteSignal
    + engagementSignal
    + ratingSignal
    + orderSignal
    + reviewSignal
    + inventorySignal
    + shippingSignal
    + priceSignal
    + titleSignals.penalty
    + taxonomySignal
    + imageSignal
    + safetySignal,
  );

  if (score >= 74 && reasons.length === 0) reasons.push("semnale produs bune");
  if (score < 58 && riskFlags.length === 0) riskFlags.push("scor calitate mic");

  return { score, reasons: reasons.slice(0, 3), riskFlags: riskFlags.slice(0, 3) };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const sortParam = (searchParams.get("sort") || "recent") as SortMode;
    const sort: SortMode = VALID_SORTS.has(sortParam) ? sortParam : "recent";
    const sourceParam = searchParams.get("source");
    const taxonomySlugParam = (searchParams.get("taxonomy_node_slug") || searchParams.get("category") || "").trim();
    const onlyFollowing = sourceParam === "following";
    // Context de profil: `creator_id=<uuid>` limitează feed-ul la clipurile unui singur creator
    // (folosit de player-ul deschis din grila de profil).
    const rawCreatorId = (searchParams.get("creator_id") || "").trim();
    const creatorIdParamValue = new RegExp(UUID_SQL_RE, "i").test(rawCreatorId) ? rawCreatorId : null;
    const hideSoftCommerce = !taxonomySlugParam && !creatorIdParamValue && sourceParam !== "following" && searchParams.get("include_soft_commerce") !== "1";
    const minScoreParam = searchParams.get("min_score");
    const minScoreRaw = minScoreParam == null ? NaN : Number(minScoreParam);
    const minSwypikScore = taxonomySlugParam || onlyFollowing || creatorIdParamValue
      ? 1
      : Number.isFinite(minScoreRaw)
        ? Math.max(1, Math.min(99, Math.round(minScoreRaw)))
        : DEFAULT_MIN_SWYPIK_SCORE;

    const pageRaw = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limitRaw = parseInt(searchParams.get("limit") || "20", 10) || 20;
    const limit = Math.min(Math.max(1, limitRaw), 50);
    const page = pageRaw;
    const offset = (page - 1) * limit;

    const publicUrl = (process.env.S3_PUBLIC_URL || process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

    const userId = await getOptionalSocialUserId();
    const rawSessionId = (searchParams.get("session_id") || "").trim();
    const viewerSessionId = SESSION_RE.test(rawSessionId) ? rawSessionId : null;

    // Deep-link `?v=<uuid>`: clipul cerut se prinde PRIMUL în pagina 1,
    // altfel linkul de pe profil deschide feed-ul pe alt video.
    const rawPinnedId = (searchParams.get("v") || "").trim();
    const pinnedVideoId = page === 1 && new RegExp(UUID_SQL_RE, "i").test(rawPinnedId) ? rawPinnedId : null;

    // Fetch extra rows when quality filtering is active so the default feed can
    // skip low-quality products without looking empty.
    const queryLimit = minSwypikScore > 1 ? Math.min(limit * 4 + 1, 200) : limit + 1;
    const queryParams: unknown[] = [queryLimit, offset];
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
    let pinnedParam = "";
    if (pinnedVideoId) {
      queryParams.push(pinnedVideoId);
      pinnedParam = `$${queryParams.length}`;
    }
    let creatorParam = "";
    if (creatorIdParamValue) {
      queryParams.push(creatorIdParamValue);
      creatorParam = `$${queryParams.length}`;
    }

    // A/B: split determinist pe viewer (user > sesiune); fara chei b:* in DB e inert.
    const { weights: feedWeights, abVariant } = await loadFeedWeightsForViewer(
      userId || viewerSessionId || null,
    );
    const engagementExpr = buildEngagementExpr(feedWeights);
    const trendingExpr = buildTrendingExpr(feedWeights);
    const equityExpr = buildEquityExpr(feedWeights, Boolean(userId) || Boolean(viewerSessionId));
    const equityJoins = buildEquityJoins(Boolean(userId), Boolean(viewerSessionId), userParam, sessionParam);
    const tasteExpr = buildTasteExpr(Boolean(userId), userParam, feedWeights.w_taste);
    // În context de profil păstrăm exact ordinea din grila de profil (published_at DESC).
    const orderClause = creatorParam
      ? `v.published_at DESC NULLS LAST, v.created_at DESC`
      : buildOrderClause(sort, Boolean(userId), Boolean(viewerSessionId), equityExpr, engagementExpr, trendingExpr, tasteExpr);
    const scoreSelect =
      sort === "popular"
        ? `, ${engagementExpr} AS engagement_score`
        : sort === "trending"
          ? `, ${trendingExpr} AS trending_score`
          : "";
    const softCommerceClause = hideSoftCommerce ? `
              AND COALESCE(mp.title, '') !~* '${DEFAULT_FEED_SOFT_BLOCK_SQL_RE}'
              AND COALESCE(mp.taxonomy_node_slug, '') !~* '(underwear|lingerie|swimwear)'
    ` : "";

    const { rows } = await dbQuery<ExploreFeedRow>(
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
        at.duration_s AS at_duration_s,
        cp.id          AS post_id,
        cp.slug        AS post_slug,
        cp.format      AS post_format,
        cp.title       AS post_title,
        cp.vote_count  AS post_vote_count,
        cp.ends_at     AS post_ends_at,
        cm.id          AS mission_id,
        cm.title       AS mission_title,
        cm.slug        AS mission_slug
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
      LEFT JOIN LATERAL (
        SELECT cp.id, cp.slug, cp.format, cp.title, cp.vote_count, cp.ends_at, cp.mission_id
        FROM community_posts cp
        WHERE cp.video_id = v.id AND cp.status = 'active'
        ORDER BY cp.created_at DESC
        LIMIT 1
      ) cp ON true
      LEFT JOIN creator_missions cm ON cm.id = cp.mission_id
      LEFT JOIN video_rank_14d vr ON vr.video_id = v.id
      ${userId ? `LEFT JOIN LATERAL (
        SELECT 1 AS actor_user_id FROM feed_events rep_fe
        WHERE rep_fe.video_id = v.id
          AND rep_fe.actor_user_id = ${userParam}::uuid
          AND rep_fe.occurred_at > NOW() - INTERVAL '24 hours'
        LIMIT 1
      ) rep_user ON true` : ``}
      ${viewerSessionId ? `LEFT JOIN LATERAL (
        SELECT 1 AS session_id FROM feed_events rep_fe2
        WHERE rep_fe2.video_id = v.id
          AND rep_fe2.session_id = ${sessionParam}
          AND rep_fe2.occurred_at > NOW() - INTERVAL '24 hours'
        LIMIT 1
      ) rep_sess ON true` : ``}
      ${userId ? `LEFT JOIN LATERAL (
        WITH user_pref AS (
          SELECT mp2.taxonomy_node_slug AS slug,
                 SUM(CASE fe2.event_type
                       WHEN 'purchase' THEN 10
                       WHEN 'save' THEN 5
                       WHEN 'more_like_this' THEN 4
                       WHEN 'add_to_cart' THEN 3
                       WHEN 'completion' THEN 2
                       WHEN 'like' THEN 1
                       ELSE 0 END)::numeric AS weight
          FROM feed_events fe2
          JOIN videos v2 ON v2.id = fe2.video_id
          LEFT JOIN video_product_links vpl2 ON vpl2.video_id = v2.id
          LEFT JOIN marketplace_products mp2 ON mp2.id = COALESCE(
            vpl2.product_id,
            CASE WHEN COALESCE(v2.product_refs->0->>'product_id', v2.product_refs->>0) ~* '${UUID_SQL_RE}'
              THEN COALESCE(v2.product_refs->0->>'product_id', v2.product_refs->>0)::uuid
              ELSE NULL END
          )
          WHERE fe2.actor_user_id = ${userParam}::uuid
            AND fe2.occurred_at > NOW() - INTERVAL '30 days'
            AND mp2.taxonomy_node_slug IS NOT NULL
          GROUP BY mp2.taxonomy_node_slug
        )
        SELECT LEAST(weight / 5.0, 10)::numeric AS affinity_boost
        FROM user_pref WHERE slug = mp.taxonomy_node_slug
        LIMIT 1
      ) uca ON mp.id IS NOT NULL` : ``}
      ${equityJoins}
      WHERE v.status = 'ready' AND v.is_hidden = false
        AND v.visibility = 'public'
        AND v.effective_label = 'safe'
          AND CASE
            WHEN vpl.product_id IS NOT NULL
              OR CASE
                WHEN COALESCE(jsonb_typeof(v.product_refs), 'null') = 'array' THEN jsonb_array_length(v.product_refs) > 0
                ELSE false
              END THEN
              mp.id IS NOT NULL
              AND mp.status = 'active'
              AND COALESCE(mp.is_adult, false) = false AND mp.effective_label = 'safe'
              AND COALESCE(mp.price_cents, 0) > 0
              AND NULLIF(BTRIM(mp.image_url), '') IS NOT NULL
              AND NULLIF(BTRIM(mp.taxonomy_node_slug), '') IS NOT NULL
              AND COALESCE(mp.title, '') !~* '${COMMERCE_BLOCKLIST_SQL_RE}'
              ${softCommerceClause}
            ELSE true
          END
        ${onlyFollowing && userId ? `AND EXISTS (SELECT 1 FROM follows f2 WHERE f2.follower_user_id = ${userParam} AND f2.following_user_id = v.creator_id)` : ''}
          ${creatorParam ? `AND v.creator_id = ${creatorParam}::uuid` : ''}
        ${userId ? `AND NOT EXISTS (SELECT 1 FROM user_hidden_videos uhv WHERE uhv.user_id = ${userParam} AND uhv.video_id = v.id)` : ''}
      ${taxonomySlugParam ? `AND mp.taxonomy_node_slug IN (
        WITH RECURSIVE descendants AS (
          SELECT slug FROM taxonomy_nodes WHERE slug = ${taxonomyParam}::text
          UNION ALL
          SELECT n.slug FROM taxonomy_nodes n JOIN descendants d ON n.parent_slug = d.slug
        ) SELECT slug FROM descendants
      )` : ''}
      ORDER BY ${pinnedParam ? `(v.id = ${pinnedParam}::uuid) DESC, ` : ""}${orderClause}
      LIMIT $1 OFFSET $2`,
      queryParams
    );

    if (rows.length > 0) {
      const mappedVideos = rows.map((row) => {
        const productId = row.mp_id ? String(row.mp_id) : firstProductRefId(row.product_refs);
        const currency = String(row.mp_currency || "RON").trim().toUpperCase();
        const priceCents = asNumber(row.mp_price_cents);
        const shippingCents = asNumber(row.mp_shipping_cost_cents);
        const worthIt = asNumber(row.worth_it_count) || 0;
        const notWorthIt = asNumber(row.not_worth_it_count) || 0;
        const totalVotes = worthIt + notWorthIt;
        const swypikScoreDetails = row.mp_id ? computeSwypikScoreDetails(row) : null;
        const swypikScore = swypikScoreDetails?.score ?? null;

        const sourceUrl = row.source_key && publicUrl ? `${publicUrl}/${row.source_key}` : null;
        const playbackUrl = row.playback_url || null;
        const preferredUrl = playbackUrl || sourceUrl;
        const url = toMediaProxyUrl(preferredUrl);
        const fallbackUrl = sourceUrl && playbackUrl && sourceUrl !== playbackUrl ? toMediaProxyUrl(sourceUrl) : null;

        const isHls = typeof url === 'string' && /\.m3u8(\?|$)/i.test(url);
        const rawThumbnail = row.thumbnail_url
          || (row.source_key && publicUrl ? `${publicUrl}/videos/thumbnails/${row.video_id}.jpg` : null);

        return {
          id: row.video_id,
          url,
          hlsUrl: isHls ? url : null,
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
            // CTA direct (ex. /fly?dest=BCN pentru postările-ofertă de zbor).
            ctaUrl: (row.mp_metadata as Record<string, unknown> | null)?.["cta_url"] as string || null,
            vertical: (row.mp_metadata as Record<string, unknown> | null)?.["vertical"] as string || null,
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
            swypikScoreReasons: swypikScoreDetails?.reasons || [],
            qualityFlags: swypikScoreDetails?.riskFlags || [],
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
          cardType: row.mission_id
            ? "mission"
            : row.post_format === "merita"
              ? "decide"
              : "watch",
          linkedPost: row.post_id ? {
            id: String(row.post_id),
            slug: row.post_slug || null,
            format: row.post_format || null,
            title: row.post_title || null,
            voteCount: asNumber(row.post_vote_count) || 0,
            endsAt: row.post_ends_at ? new Date(row.post_ends_at).toISOString() : null,
          } : null,
          mission: row.mission_id ? {
            id: String(row.mission_id),
            title: row.mission_title || null,
            slug: row.mission_slug || null,
          } : null,
          ...(row.engagement_score !== undefined && { engagementScore: Number(row.engagement_score) }),
          ...(row.trending_score !== undefined && { trendingScore: Number(row.trending_score) }),
        };
      });

      const qualityFilteredVideos = mappedVideos.filter((video) => {
        if (!video.product?.id) return true;
        return Number(video.product.swypikScore || 0) >= minSwypikScore;
      });
      const videos = qualityFilteredVideos.slice(0, limit);
      const hasMore = qualityFilteredVideos.length > limit || rows.length >= queryLimit;

      const cacheHeaders = { "Cache-Control": "private, max-age=10, stale-while-revalidate=60" };
      return NextResponse.json({ videos, page, hasMore, ab: abVariant }, { headers: cacheHeaders });
    }

    // No videos available
    const emptyHeaders = { "Cache-Control": "private, max-age=5" };
    return NextResponse.json({ videos: [], page, hasMore: false }, { headers: emptyHeaders });
  } catch (error: any) {
    logger.error({ err: error }, "Explore feed API error:");
    return NextResponse.json(
      { error: "Failed to fetch video feed" },
      { status: 500 }
    );
  }
}
