import { dbQuery } from "@/lib/db";
import { getCreatorBadges, type CreatorBadges } from "@/lib/social/creator-badges";

export type UserProfileQuery = <T = any>(
  text: string,
  params?: unknown[]
) => Promise<{ rows: T[]; rowCount: number }>;

export type PublicUserVideo = {
  id: string;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  playbackUrl: string | null;
  durationMs: number | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  saveCount: number;
  shareCount: number;
  publishedAt: string | null;
};

export type CreatorLink = {
  label: string;
  url: string;
};

export type PromotedProduct = {
  id: string;
  title: string;
  imageUrl: string | null;
  priceCents: number | null;
  currency: string;
  productUrl: string | null;
};

export type PublicUserProfile = {
  profile: {
    id: string;
    username: string;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
    isVerified: boolean;
    isFollowing: boolean;
    isOwnProfile: boolean;
    links: CreatorLink[];
    categories: string[];
  };
  stats: {
    videos: number;
    followers: number;
    following: number;
    views: number;
    likes: number;
    comments: number;
  };
  badges: CreatorBadges;
  promotedProducts: PromotedProduct[];
  videos: PublicUserVideo[];
};

type GetPublicUserProfileOptions = {
  viewerUserId?: string | null;
  limit?: number;
  query?: UserProfileQuery;
};

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean | null;
  video_count: number | string | null;
  follower_count: number | string | null;
  following_count: number | string | null;
  total_views: number | string | null;
  total_likes: number | string | null;
  total_comments: number | string | null;
  is_following: boolean | null;
  website_url: string | null;
  social_links: Record<string, unknown> | null;
  cp_category: string | null;
};

type PromotedProductRow = {
  id: string;
  title: string | null;
  image_url: string | null;
  price_cents: number | string | null;
  currency: string | null;
  product_url: string | null;
};

type VideoRow = {
  id: string;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  playback_url: string | null;
  duration_ms: number | string | null;
  view_count: number | string | null;
  like_count: number | string | null;
  comment_count: number | string | null;
  save_count: number | string | null;
  share_count: number | string | null;
  published_at: Date | string | null;
};

const USERNAME_PATTERN = /^[a-z0-9._-]{1,40}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeProfileUsername(value: unknown) {
  const username = String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();

  return USERNAME_PATTERN.test(username) ? username : null;
}

export function normalizeViewerUserId(value: unknown) {
  const id = String(value ?? "").trim();
  return UUID_PATTERN.test(id) ? id : null;
}

export async function getPublicUserProfile(
  usernameParam: string,
  options: GetPublicUserProfileOptions = {}
): Promise<PublicUserProfile | null> {
  const username = normalizeProfileUsername(usernameParam);
  if (!username) return null;

  const query = options.query || dbQuery;
  const viewerUserId = normalizeViewerUserId(options.viewerUserId);
  const limit = boundedInt(options.limit, 30, 1, 60);

  const { rows } = await query<ProfileRow>(
    `SELECT
       u.id,
       u.username,
       COALESCE(NULLIF(u.display_name, ''), NULLIF(cp.display_name, ''), u.username) AS display_name,
       COALESCE(NULLIF(u.avatar_url, ''), NULLIF(cp.avatar_url, '')) AS avatar_url,
       COALESCE(NULLIF(u.bio, ''), NULLIF(cp.bio, '')) AS bio,
       COALESCE(u.is_verified, cp.verification_status = 'verified', false) AS is_verified,
      cp.website_url,
      cp.social_links,
      cp.category AS cp_category,
       (SELECT COUNT(*)
          FROM videos v
         WHERE v.creator_id = u.id
           AND v.status = 'ready'
           AND v.visibility = 'public'
           AND COALESCE(v.is_hidden, false) = false
           AND v.effective_label = 'safe') AS video_count,
       (SELECT COUNT(*)
          FROM follows f
         WHERE f.following_user_id = u.id) AS follower_count,
       (SELECT COUNT(*)
          FROM follows f
         WHERE f.follower_user_id = u.id) AS following_count,
       (SELECT COALESCE(SUM(v.view_count), 0)
          FROM videos v
         WHERE v.creator_id = u.id
           AND v.status = 'ready'
           AND v.visibility = 'public'
           AND COALESCE(v.is_hidden, false) = false
           AND v.effective_label = 'safe') AS total_views,
       (SELECT COALESCE(SUM(v.like_count), 0)
          FROM videos v
         WHERE v.creator_id = u.id
           AND v.status = 'ready'
           AND v.visibility = 'public'
           AND COALESCE(v.is_hidden, false) = false
           AND v.effective_label = 'safe') AS total_likes,
       (SELECT COALESCE(SUM(v.comment_count), 0)
          FROM videos v
         WHERE v.creator_id = u.id
           AND v.status = 'ready'
           AND v.visibility = 'public'
           AND COALESCE(v.is_hidden, false) = false
           AND v.effective_label = 'safe') AS total_comments,
       CASE
         WHEN $2::uuid IS NULL THEN false
         WHEN $2::uuid = u.id THEN false
         ELSE EXISTS (
           SELECT 1
             FROM follows f
            WHERE f.follower_user_id = $2::uuid
              AND f.following_user_id = u.id
         )
       END AS is_following
     FROM users u
     LEFT JOIN creator_profiles cp ON cp.user_id = u.id
     WHERE lower(u.username) = $1
       AND u.status = 'active'
     LIMIT 1`,
    [username, viewerUserId]
  );

  const row = rows[0];
  if (!row) return null;

  const { rows: videoRows } = await query<VideoRow>(
    `SELECT
       v.id,
       v.title,
       v.description,
       v.thumbnail_url,
       v.playback_url,
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
       AND COALESCE(v.is_hidden, false) = false
       AND v.effective_label = 'safe'
     ORDER BY v.published_at DESC NULLS LAST, v.created_at DESC
     LIMIT $2`,
    [row.id, limit]
  );

  const [{ rows: productRows }, { rows: interestRows }, badges] = await Promise.all([
    query<PromotedProductRow>(
      `SELECT DISTINCT ON (p.id)
         p.id,
         p.title,
         p.image_url,
         p.price_cents,
         p.currency,
         p.product_url
       FROM creator_product_links cpl
       JOIN marketplace_products p ON p.id = cpl.product_id
       WHERE cpl.creator_id = $1
         AND cpl.status = 'active'
         AND p.status = 'active'
       ORDER BY p.id, cpl.created_at DESC
       LIMIT 12`,
      [row.id]
    ),
    query<{ topic: string }>(
      `SELECT topic
         FROM user_interests
        WHERE user_id = $1
        ORDER BY weight DESC, topic ASC
        LIMIT 8`,
      [row.id]
    ),
    getCreatorBadges(row.id, { verified: Boolean(row.is_verified), query }),
  ]);

  const displayName = row.display_name || row.username || "User";
  const isOwnProfile = viewerUserId === row.id;

  return {
    profile: {
      id: row.id,
      username: row.username || username,
      handle: `@${row.username || username}`,
      displayName,
      avatarUrl: emptyToNull(row.avatar_url),
      bio: emptyToNull(row.bio),
      isVerified: Boolean(row.is_verified),
      isFollowing: isOwnProfile ? false : Boolean(row.is_following),
      isOwnProfile,
      links: buildCreatorLinks(row.website_url, row.social_links),
      categories: interestRows
        .map((r) => String(r.topic || "").trim())
        .filter((t) => t.length > 0),
    },
    stats: {
      videos: toNonNegativeInt(row.video_count),
      followers: toNonNegativeInt(row.follower_count),
      following: toNonNegativeInt(row.following_count),
      views: toNonNegativeInt(row.total_views),
      likes: toNonNegativeInt(row.total_likes),
      comments: toNonNegativeInt(row.total_comments),
    },
    badges,
    promotedProducts: productRows.map(mapPromotedProductRow),
    videos: videoRows.map(mapVideoRow),
  };
}

function buildCreatorLinks(
  websiteUrl: string | null,
  socialLinks: Record<string, unknown> | null
): CreatorLink[] {
  const links: CreatorLink[] = [];
  const seen = new Set<string>();

  const push = (label: string, url: unknown) => {
    const value = String(url ?? "").trim();
    if (!value || seen.has(value)) return;
    if (!/^https?:\/\//i.test(value)) return;
    seen.add(value);
    links.push({ label, url: value });
  };

  push("Website", websiteUrl);
  if (socialLinks && typeof socialLinks === "object") {
    for (const [key, value] of Object.entries(socialLinks)) {
      const label = key.trim();
      if (!label) continue;
      push(label.charAt(0).toUpperCase() + label.slice(1), value);
    }
  }
  return links.slice(0, 8);
}

function mapPromotedProductRow(row: PromotedProductRow): PromotedProduct {
  return {
    id: row.id,
    title: String(row.title ?? "").trim() || "Produs",
    imageUrl: emptyToNull(row.image_url),
    priceCents: row.price_cents === null ? null : toNonNegativeInt(row.price_cents),
    currency: String(row.currency ?? "USD").trim() || "USD",
    productUrl: emptyToNull(row.product_url),
  };
}

function mapVideoRow(row: VideoRow): PublicUserVideo {
  return {
    id: row.id,
    title: emptyToNull(row.title),
    description: emptyToNull(row.description),
    thumbnailUrl: emptyToNull(row.thumbnail_url),
    playbackUrl: emptyToNull(row.playback_url),
    durationMs: row.duration_ms === null ? null : toNonNegativeInt(row.duration_ms),
    viewCount: toNonNegativeInt(row.view_count),
    likeCount: toNonNegativeInt(row.like_count),
    commentCount: toNonNegativeInt(row.comment_count),
    saveCount: toNonNegativeInt(row.save_count),
    shareCount: toNonNegativeInt(row.share_count),
    publishedAt: normalizeDate(row.published_at),
  };
}

function boundedInt(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(Math.trunc(number), max));
}

function toNonNegativeInt(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.trunc(number);
}

function emptyToNull(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizeDate(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
