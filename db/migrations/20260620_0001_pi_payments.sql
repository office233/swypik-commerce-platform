-- 20260620_0001_pi_payments.sql
-- Pi Network payments (User-to-App / U2A) support.
--
-- The Pi payment lifecycle is driven by the Pi Platform API + Pi SDK:
--   1. client Pi.createPayment(...)               -> we get a paymentId
--   2. Pi calls our /approve  (onReadyForServerApproval) -> POST /v2/payments/{id}/approve
--   3. user signs in Pi wallet, blockchain tx submitted -> we get a txid
--   4. Pi calls our /complete (onReadyForServerCompletion) -> POST /v2/payments/{id}/complete
--   5. incomplete payments are replayed on next SDK init   -> onIncompletePaymentFound
--
-- pi_payments is the single source of truth for where a given Pi payment is in
-- that lifecycle, and links it to the commerce_orders row it fulfils.

BEGIN;

-- Allow 'pi' as a checkout/session + transaction provider.
ALTER TABLE checkout_sessions
  DROP CONSTRAINT IF EXISTS checkout_sessions_provider_check;
ALTER TABLE checkout_sessions
  ADD CONSTRAINT checkout_sessions_provider_check
  CHECK (provider = ANY (ARRAY['stripe','shopify','paypal','manual','pi']));

CREATE TABLE IF NOT EXISTS pi_payments (
  -- Pi's own payment identifier is the natural PK (unique per payment).
  payment_id        text PRIMARY KEY,

  -- Local linkage.
  order_id          uuid REFERENCES commerce_orders(id) ON DELETE SET NULL,
  user_id           uuid REFERENCES users(id) ON DELETE SET NULL,
  pi_uid            text,                       -- Pi user uid (from /v2/me)

  -- Money. Pi amounts are decimal Pi (e.g. 3.14). We also store the RON
  -- snapshot + the exchange rate used, so an order's books are reproducible
  -- even if the rate later changes.
  amount_pi         numeric(18,7) NOT NULL,
  amount_ron_cents  bigint        NOT NULL DEFAULT 0,
  pi_to_ron_rate    numeric(18,6) NOT NULL DEFAULT 0,
  memo              text,
  metadata          jsonb         NOT NULL DEFAULT '{}'::jsonb,

  -- Lifecycle. Mirrors the Pi server-side status flags.
  --   pending    : createPayment seen, not yet approved
  --   approved   : we called /approve OK
  --   completed  : we called /complete OK (txid on chain) -> order paid
  --   cancelled  : user/dev cancelled
  --   error      : approve/complete failed or verification mismatch
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','completed','cancelled','error')),
  txid              text,                       -- blockchain tx id (set at completion)

  -- Pi server status snapshot (developer_approved / transaction_verified / etc.)
  pi_status         jsonb,

  created_at        timestamptz NOT NULL DEFAULT now(),
  approved_at       timestamptz,
  completed_at      timestamptz,
  cancelled_at      timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pi_payments_order_idx  ON pi_payments (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pi_payments_user_idx   ON pi_payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pi_payments_status_idx ON pi_payments (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS pi_payments_txid_uq ON pi_payments (txid) WHERE txid IS NOT NULL;

-- keep updated_at fresh
DROP TRIGGER IF EXISTS trg_pi_payments_set_updated_at ON pi_payments;
CREATE TRIGGER trg_pi_payments_set_updated_at
  BEFORE UPDATE ON pi_payments
  FOR EACH ROW EXECUTE FUNCTION social_set_updated_at();

INSERT INTO schema_migrations(version)
  VALUES ('20260620_0001_pi_payments')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
