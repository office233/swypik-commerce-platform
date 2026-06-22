-- Pi Network: store the user's public wallet address (returned by
-- Pi.Wallet.getUserMigratedWalletAddresses() after authenticate). The address
-- is a public Stellar key prefixed with G... so it is safe to expose to the
-- user back on their own account page. We never store balance or private key.
--
-- The column is nullable because:
--   1) email/Google-only users will never have it,
--   2) the wallet_address scope is opt-in on Pi.authenticate and the use
--      may decline it (we still create a Pi-linked account from uid+username).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pi_wallet_address text;

-- Lookup parity with the pi link table; addresses are unique-per-user but two
-- distinct apps can in theory see the same wallet via different Pi accounts.
-- We therefore index without a UNIQUE constraint and skip the lower() variant.
CREATE INDEX IF NOT EXISTS users_pi_wallet_address_idx
  ON users (pi_wallet_address)
  WHERE pi_wallet_address IS NOT NULL;
