-- Pi Network authentication support.
-- Adds 'pi' as a valid provider for oauth_accounts and indexes used by login.

ALTER TABLE oauth_accounts
  DROP CONSTRAINT IF EXISTS oauth_accounts_provider_check;

ALTER TABLE oauth_accounts
  ADD CONSTRAINT oauth_accounts_provider_check
  CHECK (provider IN ('google', 'apple', 'pi'));

-- Stash the Pi username on the users row so we can show it in the UI without
-- a join, and so a Pi-only signup has a usable username slot.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pi_username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_pi_username
  ON users (lower(pi_username))
  WHERE pi_username IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_pi_user
  ON oauth_accounts (provider, provider_user_id)
  WHERE provider = 'pi';
