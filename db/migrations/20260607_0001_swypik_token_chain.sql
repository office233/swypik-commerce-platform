-- 20260607_0001_swypik_token_chain.sql
-- Swypik Token ($SWYP) — Custom L1 blockchain + Multi-chain bridges
-- =====================================================================
-- ARCHITECTURE: SwypikChain L1 (off-chain DB initially) + bridges to
-- Bitcoin / Ethereum / BSC / Solana / Polygon.
--
-- TOKENOMICS:
--   Total supply: 21,000,000 $SWYP (decimals=9, hard cap)
--   75% mining/rewards (15.75M)
--   10% treasury multi-sig (2.1M)
--    5% liquidity bootstrap (1.05M)
--    5% team vesting 4y/cliff 6m (1.05M)
--    3% airdrop marketing (630K)
--    2% pre-sale @ $0.05 (420K = $21K initial funds)
--
-- COEXISTENCE NOTE:
--   This is the NEW token layer. Existing swyp_wallets / wallet_ledger
--   (XP/coins/reputation) remain UNTOUCHED. Migration to crypto token
--   happens via explicit user opt-in ("Convert legacy coins to $SWYP")
--   handled in a later migration after launch.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. CHAIN CORE — blocks (off-chain initially, audit trail)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS swypik_blocks (
  height          bigint PRIMARY KEY,
  hash            text NOT NULL UNIQUE,
  prev_hash       text NOT NULL,
  merkle_root     text NOT NULL,
  producer        text NOT NULL,                  -- validator address
  tx_count        integer NOT NULL DEFAULT 0,
  total_reward    numeric(20,9) NOT NULL DEFAULT 0,
  difficulty      integer NOT NULL DEFAULT 1,
  nonce           bigint NOT NULL DEFAULT 0,
  timestamp       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT swypik_blocks_hash_format CHECK (hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_swypik_blocks_timestamp
  ON swypik_blocks (timestamp DESC);

-- ---------------------------------------------------------------------
-- 2. ADDRESSES — user wallets on SwypikChain
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS swypik_addresses (
  address         text PRIMARY KEY,               -- swyp1xxx... (bech32-like)
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  pubkey          text,                            -- compressed pubkey hex
  type            text NOT NULL CHECK (type IN ('user','treasury','liquidity','bridge','burn','fee')),
  label           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT swypik_addresses_format CHECK (address ~ '^swyp1[0-9a-z]{32,62}$')
);

CREATE INDEX IF NOT EXISTS idx_swypik_addresses_user
  ON swypik_addresses (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_swypik_addresses_type
  ON swypik_addresses (type);

-- ---------------------------------------------------------------------
-- 3. BALANCES — current $SWYP balance per address (denormalized for speed)
--    Source of truth = swypik_token_txs (append-only ledger below)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS swypik_token_balances (
  address         text PRIMARY KEY REFERENCES swypik_addresses(address) ON DELETE CASCADE,
  balance         numeric(20,9) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  locked_stake    numeric(20,9) NOT NULL DEFAULT 0 CHECK (locked_stake >= 0),
  locked_presale  numeric(20,9) NOT NULL DEFAULT 0 CHECK (locked_presale >= 0),
  total_received  numeric(20,9) NOT NULL DEFAULT 0,
  total_sent      numeric(20,9) NOT NULL DEFAULT 0,
  total_mined     numeric(20,9) NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swypik_balances_top
  ON swypik_token_balances (balance DESC) WHERE balance > 0;

-- ---------------------------------------------------------------------
-- 4. TRANSACTIONS — append-only ledger (the SOURCE OF TRUTH)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS swypik_token_txs (
  txid            text PRIMARY KEY,                -- sha256 hex
  block_height    bigint REFERENCES swypik_blocks(height) ON DELETE RESTRICT,
  from_address    text REFERENCES swypik_addresses(address) ON DELETE RESTRICT,
  to_address      text NOT NULL REFERENCES swypik_addresses(address) ON DELETE RESTRICT,
  amount          numeric(20,9) NOT NULL CHECK (amount > 0),
  fee             numeric(20,9) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  tx_type         text NOT NULL CHECK (tx_type IN (
                    'mint','transfer','mining_reward','referral_reward',
                    'action_reward','presale','airdrop','stake_lock',
                    'stake_unlock','bridge_in','bridge_out','dex_swap',
                    'commerce_pay','tip','boost_burn','fee_burn'
                  )),
  memo            text,                            -- optional note
  signature       text,                            -- ed25519 sig (for on-chain txs)
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT swypik_txs_txid_format CHECK (txid ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_swypik_txs_block
  ON swypik_token_txs (block_height) WHERE block_height IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_swypik_txs_from_recent
  ON swypik_token_txs (from_address, created_at DESC) WHERE from_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_swypik_txs_to_recent
  ON swypik_token_txs (to_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swypik_txs_type_recent
  ON swypik_token_txs (tx_type, created_at DESC);

-- ---------------------------------------------------------------------
-- 5. MINING SESSIONS — TapPoW + Action Mining
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS swypik_mining_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address         text NOT NULL REFERENCES swypik_addresses(address) ON DELETE CASCADE,
  session_type    text NOT NULL CHECK (session_type IN ('daily_tap','action','referral_passive')),
  base_reward     numeric(20,9) NOT NULL,
  multiplier      numeric(6,3) NOT NULL DEFAULT 1.000,
  final_reward    numeric(20,9) NOT NULL,
  tappow_proof    text,                            -- TapPoW hash if daily_tap
  device_hash     text,                            -- anti-bot fingerprint
  ip_hash         text,                            -- anti-Sybil
  multiplier_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- e.g. {"streak":0.5,"kyc":0.5,"refs_l1":2.0,"refs_l2":1.0,"refs_l3":0.4}
  tx_id           text REFERENCES swypik_token_txs(txid),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swypik_mining_user_recent
  ON swypik_mining_sessions (user_id, created_at DESC);
-- date_trunc on timestamptz is NOT IMMUTABLE (depends on timezone), so we cast
-- to UTC explicitly before converting to date — that expression IS IMMUTABLE.
CREATE INDEX IF NOT EXISTS idx_swypik_mining_type_day
  ON swypik_mining_sessions (session_type, ((created_at AT TIME ZONE 'UTC')::date));

-- ---------------------------------------------------------------------
-- 6. MINING STATS — per-user denormalized (fast UI)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS swypik_mining_stats (
  user_id           uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_mined       numeric(20,9) NOT NULL DEFAULT 0,
  streak_current    integer NOT NULL DEFAULT 0,
  streak_best       integer NOT NULL DEFAULT 0,
  last_tap_at       timestamptz,
  last_action_at    timestamptz,
  daily_today       numeric(20,9) NOT NULL DEFAULT 0,
  daily_cap         numeric(20,9) NOT NULL DEFAULT 500,  -- anti-whale
  current_multiplier numeric(6,3) NOT NULL DEFAULT 1.000,
  -- refs
  refs_l1_active    integer NOT NULL DEFAULT 0,
  refs_l2_active    integer NOT NULL DEFAULT 0,
  refs_l3_active    integer NOT NULL DEFAULT 0,
  refs_l1_total     integer NOT NULL DEFAULT 0,
  refs_l2_total     integer NOT NULL DEFAULT 0,
  refs_l3_total     integer NOT NULL DEFAULT 0,
  -- bonuses
  kyc_face_verified boolean NOT NULL DEFAULT FALSE,
  pioneer_badge     boolean NOT NULL DEFAULT FALSE,
  security_circle_count integer NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swypik_mining_stats_leaderboard
  ON swypik_mining_stats (total_mined DESC);

-- ---------------------------------------------------------------------
-- 7. REFERRAL NETWORK (3-level deep) — UNLIMITED like Pi
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS swypik_referral_network (
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ancestor_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level           integer NOT NULL CHECK (level IN (1,2,3)),
  -- 1 = direct referral, 2 = ref of ref, 3 = ref of ref of ref
  active          boolean NOT NULL DEFAULT FALSE,  -- updated by cron (7-day tap activity)
  last_active_at  timestamptz,
  total_earned_passive numeric(20,9) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ancestor_id),
  CONSTRAINT swypik_refnet_no_self CHECK (user_id <> ancestor_id)
);

CREATE INDEX IF NOT EXISTS idx_swypik_refnet_ancestor
  ON swypik_referral_network (ancestor_id, level, active);

-- ---------------------------------------------------------------------
-- 8. KYC FACE — anti-Sybil (mandatory for referral rewards)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS swypik_kyc_face (
  user_id         uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  embedding_hash  text NOT NULL UNIQUE,            -- sha256 of face embedding (privacy)
  liveness_score  numeric(4,3) NOT NULL,
  verified_at     timestamptz NOT NULL DEFAULT now(),
  verification_method text NOT NULL DEFAULT 'mediapipe_v1',
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ---------------------------------------------------------------------
-- 9. BRIDGES — Multi-chain bridge sessions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS swypik_bridge_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  swypik_address  text NOT NULL REFERENCES swypik_addresses(address),
  external_chain  text NOT NULL CHECK (external_chain IN (
                    'bitcoin','ethereum','bsc','polygon','solana','tron','arbitrum'
                  )),
  external_address text NOT NULL,                  -- user's external wallet
  direction       text NOT NULL CHECK (direction IN ('deposit','withdraw')),
  token_symbol    text NOT NULL,                   -- e.g. 'SWYP', 'BTC', 'ETH', 'BNB'
  amount          numeric(36,18) NOT NULL CHECK (amount > 0),
  fee             numeric(36,18) NOT NULL DEFAULT 0,
  external_txid   text,                            -- tx on external chain
  swypik_txid     text REFERENCES swypik_token_txs(txid),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN (
                    'pending','external_confirmed','minted_burned','completed','failed','refunded'
                  )),
  confirmations   integer NOT NULL DEFAULT 0,
  required_confirmations integer NOT NULL DEFAULT 12,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_swypik_bridge_user_recent
  ON swypik_bridge_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swypik_bridge_pending
  ON swypik_bridge_sessions (external_chain, status) WHERE status IN ('pending','external_confirmed');

-- Bridge configurations (per chain)
CREATE TABLE IF NOT EXISTS swypik_bridge_configs (
  chain           text PRIMARY KEY CHECK (chain IN (
                    'bitcoin','ethereum','bsc','polygon','solana','tron','arbitrum'
                  )),
  enabled         boolean NOT NULL DEFAULT FALSE,
  bridge_address  text NOT NULL,                   -- our hot wallet on that chain
  contract_address text,                           -- wrapped SWYP contract (BEP-20, ERC-20, SPL, etc.)
  min_deposit     numeric(36,18) NOT NULL DEFAULT 0,
  min_withdraw    numeric(36,18) NOT NULL DEFAULT 0,
  deposit_fee_bps integer NOT NULL DEFAULT 50,     -- 0.50%
  withdraw_fee_bps integer NOT NULL DEFAULT 50,    -- 0.50%
  required_confirmations integer NOT NULL DEFAULT 12,
  rpc_url         text,
  last_synced_block bigint,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Seed default bridge configs (disabled initially, enabled when ready)
INSERT INTO swypik_bridge_configs (chain, enabled, bridge_address, min_deposit, min_withdraw, deposit_fee_bps, withdraw_fee_bps, required_confirmations)
VALUES
  ('bsc',      FALSE, 'TBD_BSC_HOT_WALLET',      0.001,  1.0,   50, 50,  15),
  ('polygon',  FALSE, 'TBD_POLYGON_HOT_WALLET',  0.001,  1.0,   50, 50, 128),
  ('ethereum', FALSE, 'TBD_ETH_HOT_WALLET',      0.01,   10.0,  50, 100, 12),
  ('solana',   FALSE, 'TBD_SOL_HOT_WALLET',      0.001,  1.0,   50, 50,  32),
  ('bitcoin',  FALSE, 'TBD_BTC_HOT_WALLET',      0.0001, 0.001, 50, 100,  6)
ON CONFLICT (chain) DO NOTHING;

-- ---------------------------------------------------------------------
-- 10. INTERNAL DEX — AMM pools (constant product x*y=k)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS swypik_dex_pools (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_a         text NOT NULL,                   -- e.g. 'SWYP'
  token_b         text NOT NULL,                   -- e.g. 'wBTC', 'wETH', 'wBNB', 'USDC'
  reserve_a       numeric(36,18) NOT NULL DEFAULT 0 CHECK (reserve_a >= 0),
  reserve_b       numeric(36,18) NOT NULL DEFAULT 0 CHECK (reserve_b >= 0),
  k_constant      numeric(72,18) GENERATED ALWAYS AS (reserve_a * reserve_b) STORED,
  total_lp_supply numeric(36,18) NOT NULL DEFAULT 0,
  fee_bps         integer NOT NULL DEFAULT 30,     -- 0.30%
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token_a, token_b)
);

CREATE TABLE IF NOT EXISTS swypik_dex_swaps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id         uuid NOT NULL REFERENCES swypik_dex_pools(id),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  swypik_address  text NOT NULL REFERENCES swypik_addresses(address),
  token_in        text NOT NULL,
  token_out       text NOT NULL,
  amount_in       numeric(36,18) NOT NULL CHECK (amount_in > 0),
  amount_out      numeric(36,18) NOT NULL CHECK (amount_out > 0),
  fee_paid        numeric(36,18) NOT NULL DEFAULT 0,
  price_impact_bps integer NOT NULL DEFAULT 0,
  swypik_txid     text REFERENCES swypik_token_txs(txid),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swypik_swaps_user_recent
  ON swypik_dex_swaps (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swypik_swaps_pool_recent
  ON swypik_dex_swaps (pool_id, created_at DESC);

CREATE TABLE IF NOT EXISTS swypik_dex_liquidity (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id         uuid NOT NULL REFERENCES swypik_dex_pools(id),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lp_balance      numeric(36,18) NOT NULL DEFAULT 0 CHECK (lp_balance >= 0),
  total_added_a   numeric(36,18) NOT NULL DEFAULT 0,
  total_added_b   numeric(36,18) NOT NULL DEFAULT 0,
  total_removed_a numeric(36,18) NOT NULL DEFAULT 0,
  total_removed_b numeric(36,18) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pool_id, user_id)
);

-- ---------------------------------------------------------------------
-- 11. STAKING — lock $SWYP for mining multiplier
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS swypik_stakes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address         text NOT NULL REFERENCES swypik_addresses(address),
  amount          numeric(20,9) NOT NULL CHECK (amount > 0),
  lock_days       integer NOT NULL CHECK (lock_days IN (30, 90, 365)),
  multiplier_bonus numeric(4,2) NOT NULL,           -- e.g. 0.25, 1.00, 5.00 (additional multiplier)
  locked_at       timestamptz NOT NULL DEFAULT now(),
  unlock_at       timestamptz NOT NULL,
  released_at     timestamptz,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','slashed'))
);

CREATE INDEX IF NOT EXISTS idx_swypik_stakes_user_active
  ON swypik_stakes (user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_swypik_stakes_unlock_due
  ON swypik_stakes (unlock_at) WHERE status = 'active';

-- ---------------------------------------------------------------------
-- 12. PRE-SALE — 420K $SWYP @ $0.05 = $21K initial funds
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS swypik_presale_purchases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  swypik_address  text NOT NULL REFERENCES swypik_addresses(address),
  amount_swyp     numeric(20,9) NOT NULL CHECK (amount_swyp > 0),
  price_usd       numeric(12,4) NOT NULL,           -- per SWYP
  total_paid_usd  numeric(12,2) NOT NULL,
  paid_currency   text NOT NULL CHECK (paid_currency IN ('USDT','USDC','BNB','ETH','BTC','EUR','RON')),
  paid_amount     numeric(36,18) NOT NULL,
  external_txid   text,                              -- if crypto, ext tx hash
  stripe_session_id text,                            -- if fiat via Stripe
  vesting_unlock_at timestamptz NOT NULL,            -- 6-12 month lock
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','vested','refunded')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  confirmed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_swypik_presale_user
  ON swypik_presale_purchases (user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 13. COMMERCE INTEGRATION — pay-in-SWYP on swypik.com
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS swypik_commerce_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid REFERENCES commerce_orders(id) ON DELETE SET NULL,
  user_id         uuid NOT NULL REFERENCES users(id),
  swypik_address  text NOT NULL REFERENCES swypik_addresses(address),
  amount_swyp     numeric(20,9) NOT NULL,
  amount_usd_equiv numeric(12,2) NOT NULL,
  exchange_rate   numeric(20,9) NOT NULL,            -- 1 SWYP = X USD at payment time
  discount_pct    numeric(5,2) NOT NULL DEFAULT 10,  -- 10% discount default
  swypik_txid     text REFERENCES swypik_token_txs(txid),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swypik_commerce_user
  ON swypik_commerce_payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swypik_commerce_order
  ON swypik_commerce_payments (order_id) WHERE order_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 14. NETWORK STATS — denormalized snapshots for UI/explorer
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS swypik_network_stats (
  snapshot_at     timestamptz PRIMARY KEY DEFAULT now(),
  total_supply    numeric(20,9) NOT NULL DEFAULT 0,
  circulating_supply numeric(20,9) NOT NULL DEFAULT 0,
  burned_supply   numeric(20,9) NOT NULL DEFAULT 0,
  locked_staked   numeric(20,9) NOT NULL DEFAULT 0,
  locked_presale  numeric(20,9) NOT NULL DEFAULT 0,
  active_miners_24h integer NOT NULL DEFAULT 0,
  total_addresses integer NOT NULL DEFAULT 0,
  total_blocks    bigint NOT NULL DEFAULT 0,
  total_txs       bigint NOT NULL DEFAULT 0,
  estimated_price_usd numeric(12,6) NOT NULL DEFAULT 0.01,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ---------------------------------------------------------------------
-- 15. ATOMIC TRANSFER FUNCTION — use this instead of direct UPDATE
--    Enforces append-only ledger + balance consistency.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION swypik_apply_tx(
  p_txid          text,
  p_block_height  bigint,
  p_from          text,
  p_to            text,
  p_amount        numeric,
  p_fee           numeric,
  p_type          text,
  p_memo          text DEFAULT NULL,
  p_metadata      jsonb DEFAULT '{}'::jsonb
) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_from_balance numeric;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'swypik_apply_tx: amount must be > 0';
  END IF;

  -- Ensure destination balance row exists
  INSERT INTO swypik_token_balances (address, balance)
    VALUES (p_to, 0)
    ON CONFLICT (address) DO NOTHING;

  -- Mint-type txs have no sender (from is NULL)
  IF p_from IS NOT NULL THEN
    -- Lock sender row
    SELECT balance INTO v_from_balance
      FROM swypik_token_balances
     WHERE address = p_from
     FOR UPDATE;

    IF v_from_balance IS NULL THEN
      RAISE EXCEPTION 'swypik_apply_tx: sender address % has no balance row', p_from;
    END IF;

    IF v_from_balance < (p_amount + p_fee) THEN
      RAISE EXCEPTION 'swypik_apply_tx: insufficient balance (have %, need %)',
        v_from_balance, (p_amount + p_fee);
    END IF;

    -- Debit sender
    UPDATE swypik_token_balances
       SET balance = balance - (p_amount + p_fee),
           total_sent = total_sent + p_amount,
           updated_at = now()
     WHERE address = p_from;
  END IF;

  -- Credit recipient
  UPDATE swypik_token_balances
     SET balance = balance + p_amount,
         total_received = total_received + p_amount,
         total_mined = CASE WHEN p_type IN ('mining_reward','referral_reward','action_reward')
                            THEN total_mined + p_amount
                            ELSE total_mined END,
         updated_at = now()
   WHERE address = p_to;

  -- Append to ledger
  INSERT INTO swypik_token_txs
    (txid, block_height, from_address, to_address, amount, fee, tx_type, memo, metadata)
  VALUES
    (p_txid, p_block_height, p_from, p_to, p_amount, p_fee, p_type, p_memo, p_metadata);

  RETURN p_txid;
END;
$$;

-- ---------------------------------------------------------------------
-- 16. GENESIS — initial supply allocation
--    Pre-creates treasury / liquidity / team / airdrop / burn addresses
-- ---------------------------------------------------------------------
INSERT INTO swypik_addresses (address, type, label, created_at) VALUES
  ('swyp1treasurymultisig0000000000000000000a', 'treasury',  'Treasury Multi-Sig (10%)',     now()),
  ('swyp1liquiditybootstrap000000000000000000', 'liquidity', 'Liquidity Bootstrap (5%)',     now()),
  ('swyp1teamvestingcliff0000000000000000000a', 'user',      'Team Vesting 4y/6m (5%)',      now()),
  ('swyp1airdropmarketing00000000000000000000', 'user',      'Airdrop Marketing (3%)',       now()),
  ('swyp1presalereserve000000000000000000000a', 'user',      'Pre-sale Reserve (2%)',        now()),
  ('swyp1miningrewardspool00000000000000000a0', 'user',      'Mining Rewards Pool (75%)',    now()),
  ('swyp1burn000000000000000000000000000000a0', 'burn',      'Burn Address (deflationary)',  now()),
  ('swyp1feecollector000000000000000000000000', 'fee',       'Protocol Fee Collector',       now())
ON CONFLICT (address) DO NOTHING;

-- Genesis block (height 0)
INSERT INTO swypik_blocks (height, hash, prev_hash, merkle_root, producer, tx_count, total_reward, difficulty, timestamp)
VALUES (
  0,
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  'genesis',
  6,
  21000000,
  1,
  '2026-06-07 00:00:00+00'
) ON CONFLICT (height) DO NOTHING;

-- Genesis allocations — mint full 21M $SWYP hard cap into the 6 designated
-- addresses at block 0. The ledger (swypik_token_txs) is the source of truth;
-- balances are derived. Each mint is recorded as a 'mint' tx with a
-- deterministic txid (sha256 of "genesis-mint|<address>") so re-running this
-- migration is idempotent.
INSERT INTO swypik_token_balances (address, balance) VALUES
  ('swyp1treasurymultisig0000000000000000000a', 0),
  ('swyp1liquiditybootstrap000000000000000000', 0),
  ('swyp1teamvestingcliff0000000000000000000a', 0),
  ('swyp1airdropmarketing00000000000000000000', 0),
  ('swyp1presalereserve000000000000000000000a', 0),
  ('swyp1miningrewardspool00000000000000000a0', 0),
  ('swyp1burn000000000000000000000000000000a0', 0),
  ('swyp1feecollector000000000000000000000000', 0)
ON CONFLICT (address) DO NOTHING;

DO $genesis$
DECLARE
  alloc record;
  v_txid text;
BEGIN
  FOR alloc IN
    SELECT * FROM (VALUES
      ('swyp1miningrewardspool00000000000000000a0', 15750000.0::numeric, 'Mining Rewards Pool (75%)'),
      ('swyp1treasurymultisig0000000000000000000a',  2100000.0::numeric, 'Treasury Multi-Sig (10%)'),
      ('swyp1teamvestingcliff0000000000000000000a',  1050000.0::numeric, 'Team Vesting (5%)'),
      ('swyp1liquiditybootstrap000000000000000000',  1050000.0::numeric, 'Liquidity Bootstrap (5%)'),
      ('swyp1airdropmarketing00000000000000000000',   630000.0::numeric, 'Airdrop Marketing (3%)'),
      ('swyp1presalereserve000000000000000000000a',   420000.0::numeric, 'Pre-sale Reserve (2%)')
    ) AS v(address, amount, label)
  LOOP
    v_txid := encode(sha256(('genesis-mint|' || alloc.address)::bytea), 'hex');
    IF NOT EXISTS (SELECT 1 FROM swypik_token_txs WHERE txid = v_txid) THEN
      INSERT INTO swypik_token_txs
        (txid, block_height, from_address, to_address, amount, fee, tx_type, memo, metadata)
      VALUES
        (v_txid, 0, NULL, alloc.address, alloc.amount, 0, 'mint',
         'Genesis allocation — ' || alloc.label,
         jsonb_build_object('allocation_label', alloc.label, 'genesis', true));

      UPDATE swypik_token_balances
         SET balance = alloc.amount,
             total_received = alloc.amount,
             updated_at = now()
       WHERE address = alloc.address;
    END IF;
  END LOOP;
END
$genesis$;

-- Update genesis block to reflect actual mint tx count
UPDATE swypik_blocks
   SET tx_count = (SELECT COUNT(*) FROM swypik_token_txs WHERE block_height = 0)
 WHERE height = 0;

-- ---------------------------------------------------------------------
-- Track migration
-- ---------------------------------------------------------------------
INSERT INTO schema_migrations (version, applied_at)
VALUES ('20260607_0001_swypik_token_chain', now())
ON CONFLICT DO NOTHING;

COMMIT;
