-- Fix: ALTER ownership of materialized views from `swypik` (superuser) to `swypik_app`
-- so that REFRESH MATERIALIZED VIEW [CONCURRENTLY] works under the app's runtime role.
--
-- Background: P0-2 (2026-06-03) moved the application to a non-superuser role
-- `swypik_app`. Materialized views previously created as `swypik` retained that
-- owner, so `REFRESH MATERIALIZED VIEW` from the app raised:
--   ERROR: must be owner of materialized view video_rank_14d
--
-- Idempotent — safe to re-run.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, matviewname
    FROM pg_matviews
    WHERE matviewowner = 'swypik'
  LOOP
    EXECUTE format('ALTER MATERIALIZED VIEW %I.%I OWNER TO swypik_app',
                   r.schemaname, r.matviewname);
  END LOOP;
END $$;
