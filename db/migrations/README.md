# Database Migrations

## How to apply a migration on production

```bash
# From /opt/swypik/app on the VPS
./scripts/db/apply-migration.sh db/migrations/YYYYMMDD_NNNN_short_name.sql
```

The script runs the SQL inside a transaction together with the
`INSERT INTO schema_migrations` row, so a failure rolls back both.
It is also idempotent: rerunning with an already-applied version is a no-op.

## Conventions

- Filename: `YYYYMMDD_NNNN_short_name.sql` (e.g. `20260518_0006_pricing_markup.sql`)
- The version stored in `schema_migrations.version` is the filename **without** `.sql`.
- Each migration **must be idempotent** (use `IF NOT EXISTS`, `CREATE OR REPLACE`,
  `DO $$ ... $$` guards, etc.).
- One logical change per migration. Keep them small and reviewable.

## Notes on legacy records

The `schema_migrations` table contains ~22 historical entries whose SQL files
were deleted/renamed before this convention was enforced. They are harmless
and intentionally left in place to preserve the audit trail. Do **not** delete
or renumber them.

## On `docker-entrypoint-initdb.d`

The compose file mounts `db/migrations/` into the postgres container's
`/docker-entrypoint-initdb.d` directory. **This only runs on first init of an
empty data volume** — for an existing production database it is a no-op.
Always use `apply-migration.sh` (or equivalent transactional flow) for new
migrations on live data.
