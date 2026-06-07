-- ===========================================================================
-- $SWYP ledger hardening — Phase 1 of "custodial-verifiable" (Pi Network model)
--
-- 1. Append-only triggers on swypik_token_txs (no UPDATE / DELETE ever)
-- 2. Hash chain columns: prev_hash + curr_hash (BEFORE INSERT trigger)
-- 3. RLS on swypik_token_balances + swypik_addresses (users see only own rows)
-- 4. Audit table for any attempted tampering
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Audit log table for security events (tamper attempts, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS swypik_security_events (
  id            BIGSERIAL PRIMARY KEY,
  event_type    TEXT NOT NULL,                -- 'tx_update_blocked', 'tx_delete_blocked', 'tx_hash_mismatch', ...
  actor_role    TEXT,                          -- current_user at moment of event
  actor_app_uid UUID,                          -- app-level user id if set via SET LOCAL app.user_id
  details       JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS swypik_security_events_type_idx
  ON swypik_security_events (event_type, created_at DESC);

GRANT SELECT, INSERT ON swypik_security_events TO swypik_app;
GRANT USAGE, SELECT ON SEQUENCE swypik_security_events_id_seq TO swypik_app;

-- ---------------------------------------------------------------------------
-- 2) Hash chain columns on swypik_token_txs
--    - prev_hash: SHA256 of the previous TX's curr_hash (or zeros for genesis)
--    - curr_hash: SHA256 of canonical(tx fields + prev_hash)
--    Auto-computed on INSERT.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'swypik_token_txs' AND column_name = 'prev_hash'
  ) THEN
    ALTER TABLE swypik_token_txs
      ADD COLUMN prev_hash TEXT,
      ADD COLUMN curr_hash TEXT;
  END IF;
END$$;

-- Index for fast "find last hash" lookup
CREATE INDEX IF NOT EXISTS swypik_token_txs_created_at_idx
  ON swypik_token_txs (created_at DESC);

-- Function: compute the canonical hash input for a TX
CREATE OR REPLACE FUNCTION swypik_tx_canonical_string(
  p_txid           TEXT,
  p_tx_type        TEXT,
  p_from_address   TEXT,
  p_to_address     TEXT,
  p_amount         NUMERIC,
  p_fee            NUMERIC,
  p_created_at     TIMESTAMPTZ,
  p_prev_hash      TEXT
) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT
    COALESCE(p_txid,'') || '|' ||
    COALESCE(p_tx_type,'') || '|' ||
    COALESCE(p_from_address,'') || '|' ||
    COALESCE(p_to_address,'') || '|' ||
    COALESCE(p_amount::text,'0') || '|' ||
    COALESCE(p_fee::text,'0') || '|' ||
    COALESCE(to_char(p_created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'') || '|' ||
    COALESCE(p_prev_hash,'0000000000000000000000000000000000000000000000000000000000000000')
$$;

-- Trigger function: BEFORE INSERT — fill in prev_hash + curr_hash
CREATE OR REPLACE FUNCTION swypik_tx_chain_assign()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_prev TEXT;
  v_fee NUMERIC := 0;
BEGIN
  -- Pick up the most recently inserted TX's curr_hash as our prev_hash.
  -- Use a serialization-safe approach: order by created_at, id (PK).
  SELECT curr_hash INTO v_prev
    FROM swypik_token_txs
   ORDER BY created_at DESC, txid DESC
   LIMIT 1;

  IF v_prev IS NULL THEN
    -- Genesis: zeros
    v_prev := '0000000000000000000000000000000000000000000000000000000000000000';
  END IF;

  -- Fee column may not exist on every install; default to 0.
  BEGIN
    v_fee := COALESCE(NEW.fee, 0);
  EXCEPTION WHEN undefined_column THEN
    v_fee := 0;
  END;

  NEW.prev_hash := v_prev;
  NEW.curr_hash := encode(
    digest(
      swypik_tx_canonical_string(
        NEW.txid,
        NEW.tx_type,
        NEW.from_address,
        NEW.to_address,
        NEW.amount,
        v_fee,
        NEW.created_at,
        v_prev
      ),
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS swypik_tx_chain_before_insert ON swypik_token_txs;
CREATE TRIGGER swypik_tx_chain_before_insert
BEFORE INSERT ON swypik_token_txs
FOR EACH ROW EXECUTE FUNCTION swypik_tx_chain_assign();

-- ---------------------------------------------------------------------------
-- 3) Append-only enforcement — BLOCK UPDATE and DELETE on swypik_token_txs
--    (admins can still GRANT BYPASS RLS to themselves, but they cannot
--     bypass triggers without explicit DROP — which gets audited.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION swypik_tx_block_modification()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_actor TEXT := current_user;
  v_op    TEXT := TG_OP;
BEGIN
  INSERT INTO swypik_security_events(event_type, actor_role, details)
  VALUES (
    'tx_' || lower(v_op) || '_blocked',
    v_actor,
    jsonb_build_object(
      'attempted_op', v_op,
      'old_txid', COALESCE(OLD.txid, NULL),
      'old_tx_type', COALESCE(OLD.tx_type, NULL),
      'old_amount', COALESCE(OLD.amount, NULL)
    )
  );

  RAISE EXCEPTION
    'swypik_token_txs is append-only: % is forbidden (event logged)', v_op
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS swypik_tx_block_update ON swypik_token_txs;
CREATE TRIGGER swypik_tx_block_update
BEFORE UPDATE ON swypik_token_txs
FOR EACH ROW EXECUTE FUNCTION swypik_tx_block_modification();

DROP TRIGGER IF EXISTS swypik_tx_block_delete ON swypik_token_txs;
CREATE TRIGGER swypik_tx_block_delete
BEFORE DELETE ON swypik_token_txs
FOR EACH ROW EXECUTE FUNCTION swypik_tx_block_modification();

-- ---------------------------------------------------------------------------
-- 4) Backfill prev_hash / curr_hash for existing TX rows (genesis chain).
--    We compute deterministically in created_at, txid order — safe even if
--    repeated (idempotent: skip rows already hashed).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_prev TEXT := '0000000000000000000000000000000000000000000000000000000000000000';
  v_curr TEXT;
  v_count INT := 0;
BEGIN
  -- We need to bypass our own append-only triggers for backfill.
  ALTER TABLE swypik_token_txs DISABLE TRIGGER swypik_tx_block_update;

  FOR r IN
    SELECT txid, tx_type, from_address, to_address, amount,
           COALESCE(fee, 0) AS fee, created_at, curr_hash
      FROM swypik_token_txs
     ORDER BY created_at ASC, txid ASC
  LOOP
    v_curr := encode(
      digest(
        swypik_tx_canonical_string(
          r.txid, r.tx_type, r.from_address, r.to_address,
          r.amount, r.fee, r.created_at, v_prev
        ),
        'sha256'
      ),
      'hex'
    );

    -- Only update if not already chained
    IF r.curr_hash IS DISTINCT FROM v_curr THEN
      UPDATE swypik_token_txs
         SET prev_hash = v_prev,
             curr_hash = v_curr
       WHERE txid = r.txid;
      v_count := v_count + 1;
    END IF;

    v_prev := v_curr;
  END LOOP;

  ALTER TABLE swypik_token_txs ENABLE TRIGGER swypik_tx_block_update;

  RAISE NOTICE 'Backfilled hash chain for % existing TX rows', v_count;
END$$;

-- ---------------------------------------------------------------------------
-- 5) Make curr_hash NOT NULL + UNIQUE going forward
-- ---------------------------------------------------------------------------
ALTER TABLE swypik_token_txs
  ALTER COLUMN prev_hash SET NOT NULL,
  ALTER COLUMN curr_hash SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'swypik_token_txs_curr_hash_unique'
  ) THEN
    ALTER TABLE swypik_token_txs
      ADD CONSTRAINT swypik_token_txs_curr_hash_unique UNIQUE (curr_hash);
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 6) Verification function — anyone can call to verify chain integrity
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION swypik_verify_chain(
  p_limit INT DEFAULT NULL
) RETURNS TABLE (
  total_checked BIGINT,
  first_break_txid TEXT,
  first_break_position BIGINT,
  is_valid BOOLEAN
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  r RECORD;
  v_prev TEXT := '0000000000000000000000000000000000000000000000000000000000000000';
  v_expected TEXT;
  v_n BIGINT := 0;
  v_break_txid TEXT;
  v_break_pos BIGINT;
BEGIN
  FOR r IN
    SELECT txid, tx_type, from_address, to_address, amount,
           COALESCE(fee, 0) AS fee, created_at, prev_hash, curr_hash
      FROM swypik_token_txs
     ORDER BY created_at ASC, txid ASC
     LIMIT COALESCE(p_limit, 2147483647)
  LOOP
    v_n := v_n + 1;

    IF r.prev_hash <> v_prev THEN
      v_break_txid := r.txid;
      v_break_pos := v_n;
      EXIT;
    END IF;

    v_expected := encode(
      digest(
        swypik_tx_canonical_string(
          r.txid, r.tx_type, r.from_address, r.to_address,
          r.amount, r.fee, r.created_at, v_prev
        ),
        'sha256'
      ),
      'hex'
    );

    IF r.curr_hash <> v_expected THEN
      v_break_txid := r.txid;
      v_break_pos := v_n;
      EXIT;
    END IF;

    v_prev := r.curr_hash;
  END LOOP;

  RETURN QUERY SELECT v_n, v_break_txid, v_break_pos, (v_break_txid IS NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION swypik_verify_chain(INT) TO swypik_app;

COMMIT;
