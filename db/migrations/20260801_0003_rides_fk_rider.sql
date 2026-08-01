-- ============================================================================
-- Audit Go 2026-08-01: FK lipsă pe rides.rider_user_id → users(id).
-- Curse orfane (user șters) deveneau invizibile pentru orice cleanup.
-- Idempotent.
-- ============================================================================

BEGIN;

-- Igienizare: dacă există curse cu rider inexistent, le anulăm ca 'system'
-- (nu le ștergem — păstrăm trasabilitatea financiară).
UPDATE rides r
   SET status = 'cancelled',
       cancelled_by = 'system',
       cancel_reason = 'orphan_rider_cleanup',
       cancelled_at = COALESCE(r.cancelled_at, now()),
       updated_at = now()
 WHERE r.rider_user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = r.rider_user_id)
   AND r.status NOT IN ('completed', 'cancelled');

-- Nulăm referințele orfane rămase ca FK-ul să poată fi validat.
UPDATE rides r
   SET rider_user_id = NULL
 WHERE r.rider_user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = r.rider_user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rides_rider_user_id_fkey'
  ) THEN
    ALTER TABLE rides
      ADD CONSTRAINT rides_rider_user_id_fkey
      FOREIGN KEY (rider_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
