#!/usr/bin/env bash
# Compare schema_migrations table vs db/migrations directory.
# Exits non-zero if there is unexplained drift (file missing on disk and not
# present as a baseline stub).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/swypik/app}"
COMPOSE_FILE="${COMPOSE_FILE:-${APP_DIR}/infra/hetzner/docker-compose.prod.yml}"
PG_CONTAINER="${PG_CONTAINER:-swypik-prod-postgres-1}"
PG_USER="${PG_USER:-swypik}"
PG_DB="${PG_DB:-swypik}"

cd "$APP_DIR"

DB_LIST=$(docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -At -c "SELECT version FROM schema_migrations ORDER BY 1")
DISK_LIST=$(ls db/migrations 2>/dev/null | grep -E '\.sql$' | sed -E 's/\.sql$//' | sort -u)
BASELINE_LIST=$(ls db/migrations/baseline 2>/dev/null | grep -E '\.sql$' | sed -E 's/\.applied\.sql$//' | sed -E 's/\.sql$//' | sort -u)

ALL_DISK=$(printf "%s\n%s\n" "$DISK_LIST" "$BASELINE_LIST" | sort -u)

MISSING_FILE=$(comm -23 <(printf "%s\n" "$DB_LIST" | sort -u) <(printf "%s\n" "$ALL_DISK"))
MISSING_DB=$(comm -13 <(printf "%s\n" "$DB_LIST" | sort -u) <(printf "%s\n" "$DISK_LIST"))

if [ -n "$MISSING_FILE" ]; then
  echo "DRIFT: versions present in DB but missing as file or baseline stub:"
  printf '  %s\n' $MISSING_FILE
  exit 2
fi
if [ -n "$MISSING_DB" ]; then
  echo "DRIFT: versions present on disk but never applied:"
  printf '  %s\n' $MISSING_DB
  exit 3
fi
echo "OK: migration disk vs DB in sync (with baseline stubs accounted for)"
