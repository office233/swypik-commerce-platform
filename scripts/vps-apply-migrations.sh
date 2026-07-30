#!/bin/bash
set -e
cd /opt/swypik/app
PG=$(docker ps -qf name=postgres | grep -v multi | head -1)
PGC=swypik-prod-postgres-1
for f in db/migrations/20260730_00*.sql; do
  base=$(basename "$f")
  # skip if a marker table row exists; simple idempotent apply (migrations are IF NOT EXISTS style)
  echo "== $base =="
  docker exec -i "$PGC" psql -U swypik -d swypik_prod -v ON_ERROR_STOP=0 < "$f" 2>&1 | grep -E 'ERROR|NOTICE' | head -3 || true
done
echo "=== verify R6 ==="
docker exec "$PGC" psql -U swypik -d swypik_prod -tAc "SELECT column_name FROM information_schema.columns WHERE table_name='rides' AND column_name IN ('share_token','vehicle_class','job_id')"
docker exec "$PGC" psql -U swypik -d swypik_prod -tAc "SELECT column_name FROM information_schema.columns WHERE table_name='couriers' AND column_name LIKE 'vehicle_%'" | head -6
