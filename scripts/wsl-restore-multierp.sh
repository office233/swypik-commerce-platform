#!/bin/bash
set -e
M=/mnt/e/vps-migrate
cd /opt/multi-erp
ls docker-compose*.yml
# pornim doar postgres întâi
docker compose up -d postgres 2>&1 | grep -viE 'warn|pull|download|extract' | tail -3 || docker compose -f docker-compose.yml up -d postgres 2>&1 | tail -3
for i in $(seq 1 30); do
  docker exec multi-erp-postgres pg_isready -U multi >/dev/null 2>&1 && break
  sleep 2
done
echo "postgres ready"
cat $M/multierp_globals.sql | docker exec -i multi-erp-postgres psql -U multi -d postgres >/dev/null 2>&1 || true
docker exec multi-erp-postgres psql -U multi -d postgres -c 'DROP DATABASE IF EXISTS multi_erp' >/dev/null 2>&1 || true
docker exec multi-erp-postgres psql -U multi -d postgres -c 'CREATE DATABASE multi_erp OWNER multi' >/dev/null
cat $M/multierp_multi_erp.dump | docker exec -i multi-erp-postgres pg_restore -U multi -d multi_erp --no-owner --role=multi 2>/dev/null || true
docker exec multi-erp-postgres psql -U multi -d multi_erp -tAc "SELECT 'tabele='||count(*) FROM information_schema.tables WHERE table_schema='public'"
# uploads
mkdir -p /opt/multi-erp/uploads-restore && tar xzf $M/multierp_uploads.tar.gz -C /opt/multi-erp/uploads-restore 2>/dev/null && echo "uploads extrase: $(du -sh /opt/multi-erp/uploads-restore | cut -f1)" || echo "uploads gol"
echo MULTIERP_RESTORE_DONE
