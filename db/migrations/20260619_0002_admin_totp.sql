-- 20260619_0002_admin_totp.sql
-- Add TOTP (RFC 6238) enforcement to the admin login flow.
--
-- Why a new table instead of users.admin_*: the admin login does NOT use
-- a user row at all — it's gated by ADMIN_SECRET (a shared env-var). So
-- we need a one-row singleton table to store the admin's TOTP secret and
-- backup codes. Keyed by a fixed UUID so there's only ever one row.

BEGIN;

CREATE TABLE IF NOT EXISTS admin_credentials (
  id                 uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  totp_secret        text,                       -- encrypted via lib/auth/totp.encryptSecret (AES-256-GCM)
  totp_enabled_at    timestamptz,                -- NULL = TOTP not yet activated (first-time setup grace)
  totp_backup_codes  text[],                     -- bcrypt-hashed; consumed on use
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_credentials_singleton CHECK (id = '00000000-0000-0000-0000-000000000001')
);

INSERT INTO admin_credentials (id) VALUES ('00000000-0000-0000-0000-000000000001')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO schema_migrations(version)
  VALUES ('20260619_0002_admin_totp')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
