import { dbQuery } from "@/lib/db";

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
  };
  stats: {
    videos: number;
    followers: number;
    following: number;
    views: number;
    likes: number;
    comments: number;
  };
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
    },
    stats: {
      videos: toNonNegativeInt(row.video_count),
      followers: toNonNegativeInt(row.follower_count),
      following: toNonNegativeInt(row.following_count),
      views: toNonNegativeInt(row.total_views),
      likes: toNonNegativeInt(row.total_likes),
      comments: toNonNegativeInt(row.total_comments),
    },
    videos: videoRows.map(mapVideoRow),
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
