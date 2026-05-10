BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION social_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_auth_id text,
  username text NOT NULL,
  display_name text,
  email text,
  avatar_url text,
  bio text,
  locale text NOT NULL DEFAULT 'en',
  role text NOT NULL DEFAULT 'shopper' CHECK (role IN ('shopper', 'creator', 'moderator', 'admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended', 'deleted')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_external_auth_id_uidx
  ON users (external_auth_id)
  WHERE external_auth_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uidx
  ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uidx
  ON users (lower(email))
  WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_status_created_at_idx
  ON users (status, created_at DESC);

CREATE TABLE IF NOT EXISTS creator_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  handle text NOT NULL,
  display_name text,
  bio text,
  avatar_url text,
  banner_url text,
  category text,
  website_url text,
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected')),
  payout_status text NOT NULL DEFAULT 'not_connected' CHECK (payout_status IN ('not_connected', 'pending', 'connected', 'restricted')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS creator_profiles_handle_lower_uidx
  ON creator_profiles (lower(handle));
CREATE INDEX IF NOT EXISTS creator_profiles_verification_status_idx
  ON creator_profiles (verification_status, created_at DESC);

CREATE TABLE IF NOT EXISTS videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creator_profile_id uuid REFERENCES creator_profiles(id) ON DELETE SET NULL,
  slug text,
  title text NOT NULL,
  description text,
  thumbnail_url text,
  playback_url text,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  visibility text NOT NULL DEFAULT 'draft' CHECK (visibility IN ('draft', 'unlisted', 'public', 'private')),
  status text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'processing', 'ready', 'failed', 'archived', 'deleted')),
  language_code text NOT NULL DEFAULT 'en',
  product_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  view_count bigint NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  like_count bigint NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  comment_count bigint NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  save_count bigint NOT NULL DEFAULT 0 CHECK (save_count >= 0),
  share_count bigint NOT NULL DEFAULT 0 CHECK (share_count >= 0),
  published_at timestamptz,
  archived_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_document tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(tags, ' ')), 'C')
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS videos_slug_uidx
  ON videos (slug)
  WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS videos_creator_created_at_idx
  ON videos (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS videos_public_feed_idx
  ON videos (published_at DESC, id)
  WHERE visibility = 'public' AND status = 'ready';
CREATE INDEX IF NOT EXISTS videos_status_idx
  ON videos (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS videos_tags_gin_idx
  ON videos USING gin (tags);
CREATE INDEX IF NOT EXISTS videos_product_refs_gin_idx
  ON videos USING gin (product_refs jsonb_path_ops);
CREATE INDEX IF NOT EXISTS videos_search_document_gin_idx
  ON videos USING gin (search_document);

CREATE TABLE IF NOT EXISTS video_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  asset_type text NOT NULL CHECK (asset_type IN ('source', 'transcoded', 'thumbnail', 'caption', 'preview', 'metadata')),
  storage_provider text NOT NULL DEFAULT 'r2' CHECK (storage_provider IN ('r2', 's3', 'minio', 'local')),
  bucket text NOT NULL,
  object_key text NOT NULL,
  public_url text,
  mime_type text,
  byte_size bigint CHECK (byte_size IS NULL OR byte_size >= 0),
  checksum_sha256 text,
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'available', 'failed', 'deleted')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_provider, bucket, object_key)
);

CREATE INDEX IF NOT EXISTS video_assets_video_type_idx
  ON video_assets (video_id, asset_type, created_at DESC);
CREATE INDEX IF NOT EXISTS video_assets_status_idx
  ON video_assets (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  parent_comment_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'deleted', 'flagged')),
  like_count bigint NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  reply_count bigint NOT NULL DEFAULT 0 CHECK (reply_count >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comments_video_created_at_idx
  ON comments (video_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comments_parent_created_at_idx
  ON comments (parent_comment_id, created_at)
  WHERE parent_comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS comments_user_created_at_idx
  ON comments (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  reaction text NOT NULL DEFAULT 'like',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (video_id IS NOT NULL AND comment_id IS NULL) OR
    (video_id IS NULL AND comment_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS likes_user_video_uidx
  ON likes (user_id, video_id)
  WHERE video_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS likes_user_comment_uidx
  ON likes (user_id, comment_id)
  WHERE comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS likes_video_created_at_idx
  ON likes (video_id, created_at DESC)
  WHERE video_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS likes_comment_created_at_idx
  ON likes (comment_id, created_at DESC)
  WHERE comment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_level text NOT NULL DEFAULT 'highlights' CHECK (notification_level IN ('none', 'highlights', 'all')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (follower_user_id <> following_user_id),
  UNIQUE (follower_user_id, following_user_id)
);

CREATE INDEX IF NOT EXISTS follows_following_created_at_idx
  ON follows (following_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS follows_follower_created_at_idx
  ON follows (follower_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  collection_name text NOT NULL DEFAULT 'default',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, video_id, collection_name)
);

CREATE INDEX IF NOT EXISTS saves_user_created_at_idx
  ON saves (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS saves_video_created_at_idx
  ON saves (video_id, created_at DESC);

CREATE TABLE IF NOT EXISTS shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('copy_link', 'native_share', 'email', 'sms', 'whatsapp', 'facebook', 'instagram', 'tiktok', 'x', 'other')),
  share_token text,
  destination_url text,
  referrer_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shares_share_token_uidx
  ON shares (share_token)
  WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS shares_video_created_at_idx
  ON shares (video_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shares_user_created_at_idx
  ON shares (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS feed_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('video_published', 'video_viewed', 'video_liked', 'video_saved', 'video_shared', 'comment_created', 'creator_followed')),
  audience text NOT NULL DEFAULT 'global' CHECK (audience IN ('global', 'followers', 'personalized')),
  score numeric(10, 4) NOT NULL DEFAULT 0,
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  CHECK (expires_at IS NULL OR expires_at > occurred_at)
);

CREATE INDEX IF NOT EXISTS feed_events_global_idx
  ON feed_events (audience, score DESC, occurred_at DESC);
CREATE INDEX IF NOT EXISTS feed_events_expires_at_idx
  ON feed_events (expires_at)
  WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS feed_events_actor_idx
  ON feed_events (actor_user_id, occurred_at DESC)
  WHERE actor_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS feed_events_video_idx
  ON feed_events (video_id, occurred_at DESC)
  WHERE video_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS feed_events_type_occurred_at_idx
  ON feed_events (event_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS creator_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  slug text,
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'unlisted', 'private')),
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS creator_collections_creator_slug_uidx
  ON creator_collections (creator_id, slug)
  WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS creator_collections_creator_sort_idx
  ON creator_collections (creator_id, sort_order, created_at DESC);

CREATE TABLE IF NOT EXISTS creator_collection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES creator_collections(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collection_id, video_id)
);

CREATE INDEX IF NOT EXISTS creator_collection_items_collection_sort_idx
  ON creator_collection_items (collection_id, sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS creator_collection_items_video_idx
  ON creator_collection_items (video_id);

CREATE TABLE IF NOT EXISTS commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  video_id uuid REFERENCES videos(id) ON DELETE SET NULL,
  source_share_id uuid REFERENCES shares(id) ON DELETE SET NULL,
  external_order_id text,
  external_line_item_id text,
  commission_type text NOT NULL DEFAULT 'affiliate' CHECK (commission_type IN ('affiliate', 'sponsored', 'manual_adjustment')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'payable', 'paid', 'void', 'refunded')),
  currency char(3) NOT NULL DEFAULT 'USD',
  gross_amount_cents integer NOT NULL DEFAULT 0 CHECK (gross_amount_cents >= 0),
  creator_amount_cents integer NOT NULL DEFAULT 0 CHECK (creator_amount_cents >= 0),
  platform_fee_cents integer NOT NULL DEFAULT 0 CHECK (platform_fee_cents >= 0),
  approved_at timestamptz,
  payable_at timestamptz,
  paid_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commissions_creator_status_idx
  ON commissions (creator_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS commissions_external_order_idx
  ON commissions (external_order_id)
  WHERE external_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commissions_video_idx
  ON commissions (video_id, created_at DESC)
  WHERE video_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  video_id uuid REFERENCES videos(id) ON DELETE SET NULL,
  comment_id uuid REFERENCES comments(id) ON DELETE SET NULL,
  notification_type text NOT NULL CHECK (notification_type IN ('follow', 'like', 'comment', 'reply', 'share', 'commission', 'system', 'upload_processed')),
  title text NOT NULL,
  body text,
  action_url text,
  delivery_status text NOT NULL DEFAULT 'queued' CHECK (delivery_status IN ('queued', 'sent', 'failed', 'suppressed')),
  read_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_user_created_at_idx
  ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_type_created_at_idx
  ON notifications (notification_type, created_at DESC);

CREATE TABLE IF NOT EXISTS video_upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id uuid REFERENCES videos(id) ON DELETE SET NULL,
  storage_provider text NOT NULL DEFAULT 'r2' CHECK (storage_provider IN ('r2', 's3', 'minio', 'local')),
  bucket text NOT NULL,
  object_key text NOT NULL,
  upload_id text,
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'uploading', 'completed', 'aborted', 'expired')),
  byte_size bigint CHECK (byte_size IS NULL OR byte_size >= 0),
  content_type text,
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS video_upload_sessions_user_created_at_idx
  ON video_upload_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS video_upload_sessions_video_idx
  ON video_upload_sessions (video_id)
  WHERE video_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS video_upload_sessions_status_expires_idx
  ON video_upload_sessions (status, expires_at);

CREATE TABLE IF NOT EXISTS video_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES video_assets(id) ON DELETE SET NULL,
  job_type text NOT NULL CHECK (job_type IN ('probe', 'transcode', 'thumbnail', 'caption', 'moderation', 'publish')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  priority integer NOT NULL DEFAULT 100,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  error_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS video_processing_jobs_queue_idx
  ON video_processing_jobs (status, priority, scheduled_at)
  WHERE status IN ('queued', 'failed');
CREATE INDEX IF NOT EXISTS video_processing_jobs_video_idx
  ON video_processing_jobs (video_id, created_at DESC);
CREATE INDEX IF NOT EXISTS video_processing_jobs_asset_idx
  ON video_processing_jobs (asset_id)
  WHERE asset_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_set_updated_at') THEN
    CREATE TRIGGER trg_users_set_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION social_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_creator_profiles_set_updated_at') THEN
    CREATE TRIGGER trg_creator_profiles_set_updated_at BEFORE UPDATE ON creator_profiles
    FOR EACH ROW EXECUTE FUNCTION social_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_videos_set_updated_at') THEN
    CREATE TRIGGER trg_videos_set_updated_at BEFORE UPDATE ON videos
    FOR EACH ROW EXECUTE FUNCTION social_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_video_assets_set_updated_at') THEN
    CREATE TRIGGER trg_video_assets_set_updated_at BEFORE UPDATE ON video_assets
    FOR EACH ROW EXECUTE FUNCTION social_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_comments_set_updated_at') THEN
    CREATE TRIGGER trg_comments_set_updated_at BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION social_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_creator_collections_set_updated_at') THEN
    CREATE TRIGGER trg_creator_collections_set_updated_at BEFORE UPDATE ON creator_collections
    FOR EACH ROW EXECUTE FUNCTION social_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_creator_collection_items_set_updated_at') THEN
    CREATE TRIGGER trg_creator_collection_items_set_updated_at BEFORE UPDATE ON creator_collection_items
    FOR EACH ROW EXECUTE FUNCTION social_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_commissions_set_updated_at') THEN
    CREATE TRIGGER trg_commissions_set_updated_at BEFORE UPDATE ON commissions
    FOR EACH ROW EXECUTE FUNCTION social_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notifications_set_updated_at') THEN
    CREATE TRIGGER trg_notifications_set_updated_at BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION social_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_video_upload_sessions_set_updated_at') THEN
    CREATE TRIGGER trg_video_upload_sessions_set_updated_at BEFORE UPDATE ON video_upload_sessions
    FOR EACH ROW EXECUTE FUNCTION social_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_video_processing_jobs_set_updated_at') THEN
    CREATE TRIGGER trg_video_processing_jobs_set_updated_at BEFORE UPDATE ON video_processing_jobs
    FOR EACH ROW EXECUTE FUNCTION social_set_updated_at();
  END IF;
END;
$$;

COMMIT;
