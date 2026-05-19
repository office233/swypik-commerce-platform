-- 20260519_0006_adult_reports_payouts_audit.sql
-- Completes the adult schema: abuse reports / DMCA takedowns, creator
-- payouts (separate ledger — never mixed with marketplace payouts),
-- and a dedicated audit log for admin actions in the 18+ space.

BEGIN;

-- =============================================================
-- Reports / takedown / DMCA
-- =============================================================

CREATE TABLE IF NOT EXISTS adult.reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  -- Anonymous reports allowed (reporter_user_id NULL + email captured).
  reporter_email  text,
  -- Target may be post, creator, or comment/dm.
  target_type     text NOT NULL CHECK (target_type IN ('post','creator','comment','dm','subscription')),
  target_id       uuid NOT NULL,
  -- 'minor'|'non_consensual'|'csam'|'revenge'|'deepfake'|'impersonation'|'copyright_dmca'|'illegal'|'spam'|'other'
  category        text NOT NULL,
  description     text NOT NULL,
  -- Evidence URLs / hashes / external refs.
  evidence        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','investigating','actioned','dismissed','escalated_law_enforcement')),
  -- SLA: hard categories must be triaged within 1 hour.
  priority        smallint NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  reviewed_by     uuid REFERENCES public.users(id),
  reviewed_at     timestamptz,
  action_taken    text,
  -- DMCA-specific: requester legal name, signed statement, sworn-true bit.
  dmca_metadata   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_open
  ON adult.reports(priority, created_at)
  WHERE status IN ('open','investigating');
CREATE INDEX IF NOT EXISTS idx_reports_target
  ON adult.reports(target_type, target_id);
-- Critical-category reports auto-escalate.
CREATE INDEX IF NOT EXISTS idx_reports_critical
  ON adult.reports(category, created_at)
  WHERE category IN ('minor','csam','non_consensual','revenge');

-- =============================================================
-- Creator payouts — completely separate from marketplace payouts.
-- =============================================================

CREATE TABLE IF NOT EXISTS adult.creator_balances (
  user_id           uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  available_minor   integer NOT NULL DEFAULT 0,  -- ready to withdraw
  pending_minor     integer NOT NULL DEFAULT 0,  -- in hold window (chargeback risk)
  lifetime_minor    integer NOT NULL DEFAULT 0,  -- gross earnings ever
  currency          text NOT NULL DEFAULT 'EUR',
  -- Required before any payout: KYC approved + payout method bound.
  payout_method     text CHECK (payout_method IN ('paxum','sepa','wire','crypto_usdt')),
  payout_account_ref text,
  -- Hold window after a transaction completes (default 14 days for adult).
  hold_days         integer NOT NULL DEFAULT 14,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS adult.payout_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount_minor    integer NOT NULL CHECK (amount_minor > 0),
  currency        text NOT NULL DEFAULT 'EUR',
  method          text NOT NULL CHECK (method IN ('paxum','sepa','wire','crypto_usdt')),
  destination_ref text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','paid','reversed')),
  requested_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_by     uuid REFERENCES public.users(id),
  reviewed_at     timestamptz,
  paid_at         timestamptz,
  external_ref    text,
  notes           text
);

CREATE INDEX IF NOT EXISTS idx_payouts_open
  ON adult.payout_requests(status, requested_at)
  WHERE status IN ('pending','approved');

-- =============================================================
-- Admin audit log (everything an admin does in 18+ space)
-- =============================================================

CREATE TABLE IF NOT EXISTS adult.audit_log (
  id            bigserial PRIMARY KEY,
  actor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  -- 'kyc_approve'|'kyc_reject'|'post_remove'|'post_flag'|'creator_ban'|'access_revoke'|'payout_approve'|'payout_reject'|'consent_revoke'|'report_close'|...
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

COMMIT;
