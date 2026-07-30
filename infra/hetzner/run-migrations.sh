#!/bin/bash
set -e

COMPOSE="/opt/swypik/app/infra/hetzner/docker-compose.prod.yml"
MIGRATION_DIR="/opt/swypik/app/db/migrations"
mapfile -t MIGRATIONS < <(find "$MIGRATION_DIR" -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sort)

if [ "${#MIGRATIONS[@]}" -eq 0 ]; then
  echo "No migrations found in $MIGRATION_DIR"
  exit 1
fi

for m in "${MIGRATIONS[@]}"; do
  echo "=== Applying: $m ==="
  docker compose -f $COMPOSE exec -T postgres \
    psql -U swypik -d swypik -f "/docker-entrypoint-initdb.d/$m" 2>&1 || echo "WARN: $m had issues"
  echo ""
done

echo "=== Checking tables ==="
docker compose -f $COMPOSE exec -T postgres \
  psql -U swypik -d swypik -c "\dt" 2>&1
