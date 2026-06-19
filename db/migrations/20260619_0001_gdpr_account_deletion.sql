-- 20260619_0001_gdpr_account_deletion.sql
-- GDPR Art. 17 (Right to Erasure) + Art. 20 (Right to Data Portability)
--
-- Soft-delete pattern: users.deletion_requested_at marks intent, but the
-- row stays for 30 days (GDPR allows a reasonable grace period for users
-- to change their mind / for ongoing legal obligations to resolve, like
-- pending orders, tax records, dispute windows).
--
-- A future cron worker hard-deletes rows where deletion_scheduled_at < now().
-- See scripts/gdpr-hard-delete.mjs (to be added separately).

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Index for the cron worker to find rows ready for hard delete.
CREATE INDEX IF NOT EXISTS users_deletion_scheduled_at_idx
  ON users (deletion_scheduled_at)
 WHERE deletion_scheduled_at IS NOT NULL AND deleted_at IS NULL;

-- Audit table: every export + delete request is logged immutably for
-- GDPR Art. 5(2) "accountability" and to defend against fraud claims.
CREATE TABLE IF NOT EXISTS gdpr_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type  text NOT NULL CHECK (request_type IN ('export', 'delete', 'delete_cancel', 'hard_delete')),
  ip_address    inet,
  user_agent    text,
  metadata      jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gdpr_requests_user_id_idx ON gdpr_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gdpr_requests_type_idx    ON gdpr_requests (request_type, created_at DESC);

INSERT INTO schema_migrations(version)
  VALUES ('20260619_0001_gdpr_account_deletion')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
