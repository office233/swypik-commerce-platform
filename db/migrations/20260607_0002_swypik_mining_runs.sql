-- $SWYP rate-based mining (open 24h sessions, Pi-style)
--
-- Diferență față de swypik_mining_sessions:
--   swypik_mining_sessions = audit log al claim-urilor (instant, tap-based)
--   swypik_mining_runs     = sesiune deschisă, acumulează în timp real, claim la final
--
-- Economic model:
--   Base rate per oră se halve-uiește anual (Bitcoin-style).
--   Multiplierul user-ului se aplică la momentul CLAIM (snapshot), nu la start.
--   Anti-whale cap zilnic = 500 SWYP rămâne.

BEGIN;

-- 1. Halving epoch table (sursa adevărului pentru rate)
CREATE TABLE IF NOT EXISTS swypik_mining_epochs (
  epoch_no       integer PRIMARY KEY,
  started_at     timestamptz NOT NULL,
  ends_at        timestamptz NOT NULL,
  base_rate_per_hour numeric(20,9) NOT NULL CHECK (base_rate_per_hour > 0),
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Seed epoch 1: 0.002646 SWYP/h base (≈ 0.0635/zi, ≈ 23/an solo)
-- Halving anual planificat
INSERT INTO swypik_mining_epochs (epoch_no, started_at, ends_at, base_rate_per_hour, notes)
VALUES
  (1, '2026-06-07 00:00:00+00', '2027-06-07 00:00:00+00', 0.002646000, 'Pioneer year — base 0.0635 SWYP/day, full incentive for early adopters'),
  (2, '2027-06-07 00:00:00+00', '2028-06-07 00:00:00+00', 0.001323000, 'First halving — 0.0317/day'),
  (3, '2028-06-07 00:00:00+00', '2029-06-07 00:00:00+00', 0.000662000, 'Second halving — 0.0159/day'),
  (4, '2029-06-07 00:00:00+00', '2030-06-07 00:00:00+00', 0.000331000, 'Third halving — 0.0079/day')
ON CONFLICT (epoch_no) DO NOTHING;

-- 2. Open mining runs (one row per started session)
CREATE TABLE IF NOT EXISTS swypik_mining_runs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address              text NOT NULL REFERENCES swypik_addresses(address) ON DELETE CASCADE,

  -- Timing
  started_at           timestamptz NOT NULL DEFAULT now(),
  ends_at              timestamptz NOT NULL,           -- started_at + 24h
  claimed_at           timestamptz,                    -- NULL = not claimed yet

  -- Snapshot config at start (so changes to epochs don't retroactively affect open runs)
  epoch_no             integer NOT NULL REFERENCES swypik_mining_epochs(epoch_no),
  base_rate_per_hour   numeric(20,9) NOT NULL CHECK (base_rate_per_hour > 0),
  duration_hours       numeric(6,2) NOT NULL DEFAULT 24.0 CHECK (duration_hours > 0),

  -- Result (filled at claim)
  multiplier_at_claim  numeric(6,3),
  multiplier_breakdown jsonb,
  final_reward         numeric(20,9),                  -- elapsed_hours × rate × multiplier
  tx_id                text REFERENCES swypik_token_txs(txid),

  -- Anti-abuse
  device_hash          text,
  ip_hash              text,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- One open (unclaimed) run per user at a time
CREATE UNIQUE INDEX IF NOT EXISTS uniq_swypik_mining_runs_open
  ON swypik_mining_runs (user_id)
  WHERE claimed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_swypik_mining_runs_user_recent
  ON swypik_mining_runs (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_swypik_mining_runs_ready_to_claim
  ON swypik_mining_runs (ends_at)
  WHERE claimed_at IS NULL;

-- 3. Helper: get current epoch for a given timestamp
CREATE OR REPLACE FUNCTION swypik_current_epoch(at_time timestamptz DEFAULT now())
RETURNS swypik_mining_epochs
LANGUAGE sql
STABLE
AS $$
  SELECT *
    FROM swypik_mining_epochs
   WHERE at_time >= started_at AND at_time < ends_at
   ORDER BY epoch_no DESC
   LIMIT 1
$$;

COMMIT;
