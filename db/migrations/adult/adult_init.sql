-- ============================================================================
-- adult_init.sql — Initial bootstrap for the swypik_adult database.
--
-- Apply against the swypik_adult database (NOT swypik) as a superuser.
--   docker exec -i swypik-prod-postgres-1 \
--       psql -U swypik -d swypik_adult < adult_init.sql
--
-- Differences vs db/migrations/20260519_0005 + 0006:
--   * No FOREIGN KEY to public.users(id) — that table lives in a different
--     database (swypik). User existence is validated at the application
--     layer; adult.users_mirror keeps a thin local copy that is upserted
--     lazily by lib/adult/userMirror.ts on first contact.
--   * Touch trigger function is declared locally as adult.touch_updated_at()
--     (the public.trg_creator_missions_touch from swypik is not visible
--     across databases).
--   * pgcrypto is required for gen_random_uuid(); created here.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS adult;
COMMENT ON SCHEMA adult IS
  'Swypik 18+ (After Dark) — fully isolated DB (swypik_adult). Never join with the swypik DB schemas at the SQL layer; cross-DB linkage is done at the app layer via user_id only.';

-- ----------------------------------------------------------------------------
-- Touch trigger (local to this DB).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adult.touch_updated_at() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- Users mirror — lazily populated copy of the small subset of public.users
-- fields that adult code needs (id, email, role). Source of truth remains
-- the swypik DB; this mirror exists only so that admin UIs in /adult/* can
-- show a creator's email without a cross-DB round-trip on every render.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS adult.users_mirror (
  user_id      uuid PRIMARY KEY,
  email        text,
  role         text,
  mirrored_at  timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_mirror_email ON adult.users_mirror(email);

DROP TRIGGER IF EXISTS trg_users_mirror_touch ON adult.users_mirror;
CREATE TRIGGER trg_users_mirror_touch
  BEFORE UPDATE ON adult.users_mirror
  FOR EACH ROW EXECUTE FUNCTION adult.touch_updated_at();

-- ============================================================================
-- Viewer-side: age verification & access grants
-- ============================================================================

CREATE TABLE IF NOT EXISTS adult.access_grants (
  user_id             uuid PRIMARY KEY,
  viewer_verified     boolean NOT NULL DEFAULT FALSE,
  verified_at         timestamptz,
  verification_method text CHECK (verification_method IN
    ('document','3p_provider','payment_attestation','self_attestation_blocked')),
  region_code         text,
  blocked_reason      text,
  expires_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS adult.age_verifications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL,
  provider             text NOT NULL,
  provider_session_ref text NOT NULL,
  status               text NOT NULL CHECK (status IN ('pending','approved','rejected','expired','review')),
  result_metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  rejection_reason     text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  decided_at           timestamptz
);
CREATE INDEX IF NOT EXISTS idx_age_verif_user_recent
  ON adult.age_verifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_age_verif_status
  ON adult.age_verifications(status) WHERE status IN ('pending','review');

-- ============================================================================
-- Creator-side: KYC + consent releases
-- ============================================================================

CREATE TABLE IF NOT EXISTS adult.creator_kyc (
  user_id          uuid PRIMARY KEY,
  legal_first_name text NOT NULL,
  legal_last_name  text NOT NULL,
  date_of_birth    date NOT NULL,
  document_type    text NOT NULL CHECK (document_type IN ('passport','national_id','drivers_license')),
  provider         text NOT NULL,
  provider_ref     text NOT NULL,
  address_country  text NOT NULL,
  address_region   text,
  tax_id_ref       text,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','review','approved','rejected','revoked')),
  reviewed_at      timestamptz,
  reviewed_by      uuid,
  rejection_reason text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creator_kyc_must_be_adult
    CHECK (date_of_birth <= (CURRENT_DATE - INTERVAL '18 years'))
);
CREATE INDEX IF NOT EXISTS idx_creator_kyc_status
  ON adult.creator_kyc(status) WHERE status IN ('pending','review');

CREATE TABLE IF NOT EXISTS adult.consent_releases (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id    uuid NOT NULL,
  subject_legal_name text NOT NULL,
  subject_dob        date NOT NULL,
  subject_user_id    uuid,
  signed_pdf_sha256  text NOT NULL,
  signed_at          timestamptz NOT NULL,
  ip_address         inet,
  scope_description  text NOT NULL,
  revoked_at         timestamptz,
  revocation_reason  text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consent_subject_must_be_adult
    CHECK (subject_dob <= (signed_at::date - INTERVAL '18 years'))
);
CREATE INDEX IF NOT EXISTS idx_consent_creator
  ON adult.consent_releases(creator_user_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS idx_consent_active
  ON adult.consent_releases(creator_user_id) WHERE revoked_at IS NULL;

-- ============================================================================
-- Content: posts, moderation, subscriptions, PPV, tips, transactions
-- ============================================================================

CREATE TABLE IF NOT EXISTS adult.posts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id          uuid NOT NULL,
  kind                     text NOT NULL CHECK (kind IN ('photo_set','video','live','ppv','drop','bundle')),
  title                    text NOT NULL,
  description              text,
  preview_media_key        text,
  premium_media_key        text,
  duration_seconds         integer,
  price_minor              integer NOT NULL DEFAULT 0,
  currency                 text NOT NULL DEFAULT 'EUR',
  requires_subscription    boolean NOT NULL DEFAULT FALSE,
  subscription_tier_minor  integer,
  consent_release_ids      uuid[] NOT NULL DEFAULT '{}',
  status                   text NOT NULL DEFAULT 'pending_moderation'
                             CHECK (status IN ('draft','pending_moderation','active','removed','flagged','dmca_removed')),
  moderation_score         numeric(5,2),
  moderation_decision      text,
  decided_at               timestamptz,
  decided_by               uuid,
  unlock_count             integer NOT NULL DEFAULT 0,
  tip_total_minor          integer NOT NULL DEFAULT 0,
  view_count               integer NOT NULL DEFAULT 0,
  published_at             timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_active_needs_consent
    CHECK (status <> 'active' OR array_length(consent_release_ids, 1) >= 1)
);
CREATE INDEX IF NOT EXISTS idx_adult_posts_creator_recent
  ON adult.posts(creator_user_id, published_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_adult_posts_moderation
  ON adult.posts(status, created_at)
  WHERE status IN ('pending_moderation','flagged');
CREATE INDEX IF NOT EXISTS idx_adult_posts_active_published
  ON adult.posts(published_at DESC) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS adult.moderation_queue (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id        uuid NOT NULL REFERENCES adult.posts(id) ON DELETE CASCADE,
  ai_score       numeric(5,2),
  ai_flags       jsonb NOT NULL DEFAULT '{}'::jsonb,
  human_decision text CHECK (human_decision IN ('pass','block','escalate')),
  decided_by     uuid,
  decided_at     timestamptz,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_modq_open
  ON adult.moderation_queue(created_at)
  WHERE human_decision IS NULL;

CREATE TABLE IF NOT EXISTS adult.subscriptions (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_user_id                uuid NOT NULL,
  creator_user_id            uuid NOT NULL,
  tier_minor                 integer NOT NULL,
  currency                   text NOT NULL DEFAULT 'EUR',
  processor                  text NOT NULL CHECK (processor IN ('ccbill','verotel','segpay','paxum','manual_test')),
  processor_subscription_ref text NOT NULL,
  started_at                 timestamptz NOT NULL DEFAULT now(),
  current_period_end         timestamptz NOT NULL,
  cancelled_at               timestamptz,
  status                     text NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active','past_due','cancelled','refunded')),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fan_user_id, creator_user_id, processor_subscription_ref)
);
CREATE INDEX IF NOT EXISTS idx_subs_active_fan
  ON adult.subscriptions(fan_user_id, creator_user_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS adult.ppv_unlocks (
  fan_user_id   uuid NOT NULL,
  post_id       uuid NOT NULL REFERENCES adult.posts(id) ON DELETE CASCADE,
  paid_minor    integer NOT NULL,
  currency      text NOT NULL DEFAULT 'EUR',
  processor     text NOT NULL CHECK (processor IN ('ccbill','verotel','segpay','paxum','manual_test')),
  processor_ref text NOT NULL,
  unlocked_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fan_user_id, post_id)
);

CREATE TABLE IF NOT EXISTS adult.tips (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_user_id     uuid NOT NULL,
  creator_user_id uuid NOT NULL,
  post_id         uuid REFERENCES adult.posts(id) ON DELETE SET NULL,
  amount_minor    integer NOT NULL CHECK (amount_minor > 0),
  currency        text NOT NULL DEFAULT 'EUR',
  processor       text NOT NULL CHECK (processor IN ('ccbill','verotel','segpay','paxum','manual_test')),
  processor_ref   text NOT NULL,
  message         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tips_creator_recent
  ON adult.tips(creator_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS adult.transactions (
  id                   bigserial PRIMARY KEY,
  user_id              uuid NOT NULL,
  counterparty_user_id uuid,
  kind                 text NOT NULL CHECK (kind IN ('subscription','ppv','tip','payout','refund','chargeback','fee')),
  amount_minor         integer NOT NULL,
  currency             text NOT NULL,
  processor            text NOT NULL CHECK (processor IN ('ccbill','verotel','segpay','paxum','manual_test')),
  processor_ref        text NOT NULL,
  ref_table            text,
  ref_id               uuid,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_adult_tx_user
  ON adult.transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adult_tx_processor
  ON adult.transactions(processor, processor_ref);

-- ============================================================================
-- Reports / DMCA
-- ============================================================================

CREATE TABLE IF NOT EXISTS adult.reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid,
  reporter_email   text,
  target_type      text NOT NULL CHECK (target_type IN ('post','creator','comment','dm','subscription')),
  target_id        uuid NOT NULL,
  category         text NOT NULL,
  description      text NOT NULL,
  evidence         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status           text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','investigating','actioned','dismissed','escalated_law_enforcement')),
  priority         smallint NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  reviewed_by      uuid,
  reviewed_at      timestamptz,
  action_taken     text,
  dmca_metadata    jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_open
  ON adult.reports(priority, created_at)
  WHERE status IN ('open','investigating');
CREATE INDEX IF NOT EXISTS idx_reports_target
  ON adult.reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reports_critical
  ON adult.reports(category, created_at)
  WHERE category IN ('minor','csam','non_consensual','revenge');

-- ============================================================================
-- Payouts (separate ledger; never mixed with marketplace payouts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS adult.creator_balances (
  user_id            uuid PRIMARY KEY,
  available_minor    integer NOT NULL DEFAULT 0,
  pending_minor      integer NOT NULL DEFAULT 0,
  lifetime_minor     integer NOT NULL DEFAULT 0,
  currency           text NOT NULL DEFAULT 'EUR',
  payout_method      text CHECK (payout_method IN ('paxum','sepa','wire','crypto_usdt')),
  payout_account_ref text,
  hold_days          integer NOT NULL DEFAULT 14,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS adult.payout_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  amount_minor    integer NOT NULL CHECK (amount_minor > 0),
  currency        text NOT NULL DEFAULT 'EUR',
  method          text NOT NULL CHECK (method IN ('paxum','sepa','wire','crypto_usdt')),
  destination_ref text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','paid','reversed')),
  requested_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  paid_at         timestamptz,
  external_ref    text,
  notes           text
);
CREATE INDEX IF NOT EXISTS idx_payouts_open
  ON adult.payout_requests(status, requested_at)
  WHERE status IN ('pending','approved');

-- ============================================================================
-- Audit log (every admin action in /adult/*)
-- ============================================================================

CREATE TABLE IF NOT EXISTS adult.audit_log (
  id            bigserial PRIMARY KEY,
  actor_user_id uuid,
  action        text NOT NULL,
  target_type   text NOT NULL,
  target_id     uuid NOT NULL,
  reason        text,
  before_state  jsonb,
  after_state   jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_actor
  ON adult.audit_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target
  ON adult.audit_log(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action
  ON adult.audit_log(action, created_at DESC);

-- ----------------------------------------------------------------------------
-- Touch triggers
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_adult_access_touch ON adult.access_grants;
CREATE TRIGGER trg_adult_access_touch
  BEFORE UPDATE ON adult.access_grants
  FOR EACH ROW EXECUTE FUNCTION adult.touch_updated_at();

DROP TRIGGER IF EXISTS trg_adult_kyc_touch ON adult.creator_kyc;
CREATE TRIGGER trg_adult_kyc_touch
  BEFORE UPDATE ON adult.creator_kyc
  FOR EACH ROW EXECUTE FUNCTION adult.touch_updated_at();

DROP TRIGGER IF EXISTS trg_adult_posts_touch ON adult.posts;
CREATE TRIGGER trg_adult_posts_touch
  BEFORE UPDATE ON adult.posts
  FOR EACH ROW EXECUTE FUNCTION adult.touch_updated_at();

DROP TRIGGER IF EXISTS trg_adult_subs_touch ON adult.subscriptions;
CREATE TRIGGER trg_adult_subs_touch
  BEFORE UPDATE ON adult.subscriptions
  FOR EACH ROW EXECUTE FUNCTION adult.touch_updated_at();

DROP TRIGGER IF EXISTS trg_adult_balances_touch ON adult.creator_balances;
CREATE TRIGGER trg_adult_balances_touch
  BEFORE UPDATE ON adult.creator_balances
  FOR EACH ROW EXECUTE FUNCTION adult.touch_updated_at();

-- ============================================================================
-- Grant the app role full access to everything we just created.
-- (Role swypik_adult_app is created by the bootstrap SQL run as superuser
-- before this file is applied. Tables here are owned by the connecting
-- superuser; we grant the app role usage + privileges explicitly.)
-- ============================================================================

GRANT USAGE ON SCHEMA adult TO swypik_adult_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA adult TO swypik_adult_app;
GRANT USAGE, SELECT, UPDATE                  ON ALL SEQUENCES IN SCHEMA adult TO swypik_adult_app;
GRANT EXECUTE                               ON ALL FUNCTIONS  IN SCHEMA adult TO swypik_adult_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA adult
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO swypik_adult_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA adult
  GRANT USAGE, SELECT, UPDATE          ON SEQUENCES TO swypik_adult_app;

COMMIT;
