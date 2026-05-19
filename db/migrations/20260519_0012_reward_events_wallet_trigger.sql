-- 20260519_0012_reward_events_wallet_trigger.sql
-- Single source of truth for wallet balance reconciliation.
-- Any INSERT into reward_events (regardless of source endpoint) atomically
-- UPSERTs swyp_wallets.balance_points and lifetime_earned.
-- Removes need for endpoints to manually keep the wallet in sync.

BEGIN;

CREATE OR REPLACE FUNCTION fn_reward_events_credit_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only credit positive points. Negative / reversal events should use a
  -- separate path (wallet_ledger debits) to keep accounting clean.
  IF NEW.points_awarded IS NULL OR NEW.points_awarded <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO swyp_wallets (user_id, balance_points, lifetime_earned)
  VALUES (NEW.user_id, NEW.points_awarded, NEW.points_awarded)
  ON CONFLICT (user_id) DO UPDATE
    SET balance_points  = swyp_wallets.balance_points  + EXCLUDED.balance_points,
        lifetime_earned = swyp_wallets.lifetime_earned + EXCLUDED.lifetime_earned,
        updated_at      = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reward_events_credit_wallet ON reward_events;
CREATE TRIGGER trg_reward_events_credit_wallet
AFTER INSERT ON reward_events
FOR EACH ROW
EXECUTE FUNCTION fn_reward_events_credit_wallet();

INSERT INTO schema_migrations (version, applied_at)
VALUES ('20260519_0012_reward_events_wallet_trigger', now())
ON CONFLICT DO NOTHING;

COMMIT;
