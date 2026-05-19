-- 20260519_0005_swypik_adult.sql
-- Swypik 18+ ("After Dark"): completely isolated adult creator commerce
-- platform that shares only the user account.
--
-- ARCHITECTURAL RULES (enforced in DB + app):
--   1. ALL adult-specific tables live in the `adult` schema. The public
--      schema feed (community_posts, products, etc.) NEVER references
--      adult.* tables and adult.* tables NEVER bleed into public feeds.
--   2. Viewers need adult.access_grants.viewer_verified=TRUE before any
--      /adult/* route renders content.
--   3. Creators need adult.creator_kyc.status='approved' AND a signed
--      consent release per post for ANY recognisable person before
--      adult.posts.status can transition to 'active'.
--   4. Payment processor is NEVER Stripe for adult flows. Stub interface
--      lives in lib/adult/payments/; adult.transactions.processor must
--      be one of {ccbill,verotel,segpay,paxum,manual_test}.
--   5. No content can be published without moderation_queue review (AI
--      gate + human review for first 100 posts per creator, then sampled).
--   6. Hard prohibition (DB + app): minors, non-consensual content,
--      deepfake without explicit signed model release, revenge content.
--      Subjects in adult.consent_releases must have dob with age >= 18 at
--      the moment of release (enforced via CHECK).

BEGIN;

CREATE SCHEMA IF NOT EXISTS adult;
COMMENT ON SCHEMA adult IS
  'Swypik 18+ (After Dark) — isolated adult creator commerce. Never join with public.community_posts/products in any user-facing query.';

-- =============================================================
-- Viewer-side: age verification & access grants
-- =============================================================

CREATE TABLE IF NOT EXISTS adult.access_grants (
  user_id           uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  viewer_verified   boolean NOT NULL DEFAULT FALSE,
  verified_at       timestamptz,
  verification_method text CHECK (verification_method IN ('document','3p_provider','payment_attestation','self_attestation_blocked')),
  -- ISO-3166-1 alpha-2; some regions need extra gating (US states, UK, etc.).
  region_code       text,
  -- Soft-block reason (region disallowed, sanctioned country, prior abuse, etc.).
  blocked_reason    text,
  expires_at        timestamptz,        -- some methods require re-verification
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS adult.age_verifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- 'veriff'|'sumsub'|'ondato'|'manual_admin' — NEVER use weak self-declaration.
  provider          text NOT NULL,
  provider_session_ref text NOT NULL,
  status            text NOT NULL CHECK (status IN ('pending','approved','rejected','expired','review')),
  -- Anonymised payload only (no raw scans stored — provider keeps those).
  result_metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Raw ID number / face image are NEVER stored here. Only the provider
  -- reference and pass/fail outcome.
  rejection_reason  text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  decided_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_age_verif_user_recent
  ON adult.age_verifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_age_verif_status
  ON adult.age_verifications(status) WHERE status IN ('pending','review');

-- =============================================================
-- Creator-side: KYC + consent releases (US 18 USC 2257 / Mastercard
-- adult content standards / DSA art.28 risk mitigation)
-- =============================================================

CREATE TABLE IF NOT EXISTS adult.creator_kyc (
  user_id           uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  legal_first_name  text NOT NULL,
  legal_last_name   text NOT NULL,
  -- Stored as DATE; CHECK confirms age >= 18 at row creation.
  date_of_birth     date NOT NULL,
  document_type     text NOT NULL CHECK (document_type IN ('passport','national_id','drivers_license')),
  -- Reference returned by the KYC provider (Veriff/Sumsub/Ondato). The
  -- actual document scans are never stored in our DB.
  provider          text NOT NULL,
  provider_ref      text NOT NULL,
  address_country   text NOT NULL,    -- ISO-3166-1 alpha-2
  address_region    text,
  tax_id_ref        text,              -- for payout/1099 reporting
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','review','approved','rejected','revoked')),
  reviewed_at       timestamptz,
  reviewed_by       uuid REFERENCES public.users(id),
  rejection_reason  text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Hard rule: creator must be at least 18 on the day of submission.
  CONSTRAINT creator_kyc_must_be_adult
    CHECK (date_of_birth <= (CURRENT_DATE - INTERVAL '18 years'))
);

CREATE INDEX IF NOT EXISTS idx_creator_kyc_status
  ON adult.creator_kyc(status) WHERE status IN ('pending','review');

-- Per-content model release. Every recognisable person in a clip MUST
-- have a signed release with a verified DOB >= 18.
CREATE TABLE IF NOT EXISTS adult.consent_releases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- The subject themselves may be the creator (selfies) or a third party.
  subject_legal_name text NOT NULL,
  subject_dob       date NOT NULL,
  -- Optional link to the subject's Swypik account (when subject also has KYC).
  subject_user_id   uuid REFERENCES public.users(id),
  -- Hashed (sha256) reference to the signed-PDF asset in R2; raw PDF
  -- access requires elevated admin scope.
  signed_pdf_sha256 text NOT NULL,
  signed_at         timestamptz NOT NULL,
  ip_address        inet,
  -- Free-form scope: "all photos in series X", "single video <id>", etc.
  scope_description text NOT NULL,
  -- Revocation: subjects can withdraw consent; affected posts auto-pull.
  revoked_at        timestamptz,
  revocation_reason text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- Hard rule: subject must be >= 18 at the moment of signing.
  CONSTRAINT consent_subject_must_be_adult
    CHECK (subject_dob <= (signed_at::date - INTERVAL '18 years'))
);

CREATE INDEX IF NOT EXISTS idx_consent_creator
  ON adult.consent_releases(creator_user_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS idx_consent_active
  ON adult.consent_releases(creator_user_id) WHERE revoked_at IS NULL;

-- =============================================================
-- Content: posts, subscriptions, PPV, tips
-- =============================================================

CREATE TABLE IF NOT EXISTS adult.posts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind              text NOT NULL CHECK (kind IN ('photo_set','video','live','ppv','drop','bundle')),
  title             text NOT NULL,
  description       text,
  -- R2 key for the safe preview (always shown in 18+ feed for verified viewers).
  preview_media_key text,
  -- R2 key for premium media; access gated by subscription/PPV unlock.
  premium_media_key text,
  duration_seconds  integer,
  price_minor       integer NOT NULL DEFAULT 0,  -- PPV unlock price; 0 = subscription-only
  currency          text NOT NULL DEFAULT 'EUR',
  requires_subscription boolean NOT NULL DEFAULT FALSE,
  subscription_tier_minor integer,               -- minimum monthly tier (NULL = any)
  -- Each post must reference at least one consent release row.
  consent_release_ids uuid[] NOT NULL DEFAULT '{}',
  status            text NOT NULL DEFAULT 'pending_moderation'
                      CHECK (status IN ('draft','pending_moderation','active','removed','flagged','dmca_removed')),
  moderation_score  numeric(5,2),                -- AI score 0..100
  moderation_decision text,                       -- 'auto_pass'|'human_pass'|'auto_block'|'human_block'
  decided_at        timestamptz,
  decided_by        uuid REFERENCES public.users(id),
  -- Engagement counters (denormalised for speed; NEVER joined to public.community_posts).
  unlock_count      integer NOT NULL DEFAULT 0,
  tip_total_minor   integer NOT NULL DEFAULT 0,
  view_count        integer NOT NULL DEFAULT 0,
  published_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Hard rule: a post may only be active if it references at least one
  -- consent release. Enforced by app + this CHECK as defence in depth.
  CONSTRAINT post_active_needs_consent
    CHECK (status <> 'active' OR array_length(consent_release_ids, 1) >= 1)
);

CREATE INDEX IF NOT EXISTS idx_adult_posts_creator_recent
  ON adult.posts(creator_user_id, published_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_adult_posts_moderation
  ON adult.posts(status, created_at)
  WHERE status IN ('pending_moderation','flagged');

CREATE TABLE IF NOT EXISTS adult.moderation_queue (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           uuid NOT NULL REFERENCES adult.posts(id) ON DELETE CASCADE,
  ai_score          numeric(5,2),
  ai_flags          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {minor_detected, weapons, gore, csam_hash_hit, ...}
  human_decision    text CHECK (human_decision IN ('pass','block','escalate')),
  decided_by        uuid REFERENCES public.users(id),
  decided_at        timestamptz,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_modq_open
  ON adult.moderation_queue(created_at)
  WHERE human_decision IS NULL;

CREATE TABLE IF NOT EXISTS adult.subscriptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  creator_user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tier_minor          integer NOT NULL,
  currency            text NOT NULL DEFAULT 'EUR',
  -- HARD RULE: never Stripe. App-level enum validated against the same list.
  processor           text NOT NULL CHECK (processor IN ('ccbill','verotel','segpay','paxum','manual_test')),
  processor_subscription_ref text NOT NULL,
  started_at          timestamptz NOT NULL DEFAULT now(),
  current_period_end  timestamptz NOT NULL,
  cancelled_at        timestamptz,
  status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','past_due','cancelled','refunded')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fan_user_id, creator_user_id, processor_subscription_ref)
);

CREATE INDEX IF NOT EXISTS idx_subs_active_fan
  ON adult.subscriptions(fan_user_id, creator_user_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS adult.ppv_unlocks (
  fan_user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  post_id         uuid NOT NULL REFERENCES adult.posts(id) ON DELETE CASCADE,
  paid_minor      integer NOT NULL,
  currency        text NOT NULL DEFAULT 'EUR',
  processor       text NOT NULL CHECK (processor IN ('ccbill','verotel','segpay','paxum','manual_test')),
  processor_ref   text NOT NULL,
  unlocked_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fan_user_id, post_id)
);

CREATE TABLE IF NOT EXISTS adult.tips (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  creator_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
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

-- Append-only transaction log: ALL money movements in 18+ space.
CREATE TABLE IF NOT EXISTS adult.transactions (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  counterparty_user_id uuid REFERENCES public.users(id),
  kind            text NOT NULL CHECK (kind IN ('subscription','ppv','tip','payout','refund','chargeback','fee')),
  amount_minor    integer NOT NULL,  -- signed
  currency        text NOT NULL,
  processor       text NOT NULL CHECK (processor IN ('ccbill','verotel','segpay','paxum','manual_test')),
  processor_ref   text NOT NULL,
  ref_table       text,
  ref_id          uuid,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adult_tx_user
  ON adult.transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adult_tx_processor
  ON adult.transactions(processor, processor_ref);

-- Touch trigger reuse.
DROP TRIGGER IF EXISTS trg_adult_access_touch ON adult.access_grants;
CREATE TRIGGER trg_adult_access_touch
  BEFORE UPDATE ON adult.access_grants
  FOR EACH ROW EXECUTE FUNCTION public.trg_creator_missions_touch();

DROP TRIGGER IF EXISTS trg_adult_kyc_touch ON adult.creator_kyc;
CREATE TRIGGER trg_adult_kyc_touch
  BEFORE UPDATE ON adult.creator_kyc
  FOR EACH ROW EXECUTE FUNCTION public.trg_creator_missions_touch();

DROP TRIGGER IF EXISTS trg_adult_posts_touch ON adult.posts;
CREATE TRIGGER trg_adult_posts_touch
  BEFORE UPDATE ON adult.posts
  FOR EACH ROW EXECUTE FUNCTION public.trg_creator_missions_touch();

DROP TRIGGER IF EXISTS trg_adult_subs_touch ON adult.subscriptions;
CREATE TRIGGER trg_adult_subs_touch
  BEFORE UPDATE ON adult.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.trg_creator_missions_touch();

COMMIT;
