-- ============================================================================
-- Migration: 20260514 Adult content gating + age verification
-- Purpose: Tag adult products/videos/categories; gate access via verified age
-- ============================================================================

BEGIN;

-- 1) Tag columns -------------------------------------------------------------
ALTER TABLE marketplace_products
  ADD COLUMN IF NOT EXISTS is_adult     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS adult_reason TEXT;

ALTER TABLE ae_products
  ADD COLUMN IF NOT EXISTS is_adult     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS adult_reason TEXT;

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS is_adult     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS adult_reason TEXT;

ALTER TABLE ae_categories
  ADD COLUMN IF NOT EXISTS is_adult BOOLEAN NOT NULL DEFAULT false;

-- Partial indexes for the hot path (default feed = is_adult=false)
CREATE INDEX IF NOT EXISTS idx_mp_non_adult       ON marketplace_products(id) WHERE is_adult = false;
CREATE INDEX IF NOT EXISTS idx_videos_non_adult   ON videos(id)               WHERE is_adult = false;
CREATE INDEX IF NOT EXISTS idx_ae_prod_non_adult  ON ae_products(id)          WHERE is_adult = false;

-- Indexes for adult section listing
CREATE INDEX IF NOT EXISTS idx_mp_adult       ON marketplace_products(created_at DESC) WHERE is_adult = true;
CREATE INDEX IF NOT EXISTS idx_videos_adult   ON videos(created_at DESC)               WHERE is_adult = true;

-- 2) Age verification table --------------------------------------------------
CREATE TABLE IF NOT EXISTS user_age_verifications (
  user_id              uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status               text NOT NULL CHECK (status IN ('pending','approved','rejected','expired','revoked')),
  method               text,        -- 'stripe_identity','veriff','sumsub','manual'
  provider_session_id  text,        -- e.g. Stripe Identity verification_session id
  document_country     char(2),
  date_of_birth        date,
  verified_at          timestamptz,
  expires_at           timestamptz,
  rejection_reason     text,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_age_verif_active ON user_age_verifications(user_id)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_age_verif_pending ON user_age_verifications(created_at DESC)
  WHERE status = 'pending';

-- 3) Audit log ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS adult_content_access_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  resource_type text NOT NULL CHECK (resource_type IN ('video','product','category','feed_query')),
  resource_id   uuid,
  action        text NOT NULL DEFAULT 'view',  -- view, click, purchase_attempt
  ip_inet       inet,
  user_agent    text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adult_log_user_time ON adult_content_access_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adult_log_resource  ON adult_content_access_log(resource_type, resource_id);

-- 4) Helper view: who is currently verified ----------------------------------
CREATE OR REPLACE VIEW v_age_verified_users AS
SELECT user_id, verified_at, expires_at, method
FROM user_age_verifications
WHERE status = 'approved'
  AND (expires_at IS NULL OR expires_at > now());

-- 5) Touch-trigger for updated_at on user_age_verifications ------------------
CREATE OR REPLACE FUNCTION fn_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_age_verif_touch ON user_age_verifications;
CREATE TRIGGER trg_age_verif_touch BEFORE UPDATE ON user_age_verifications
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

COMMIT;
