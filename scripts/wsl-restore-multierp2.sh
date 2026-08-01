#!/bin/bash
set -e
M=/mnt/e/vps-migrate
cd /opt/multi-erp
docker compose -f docker-compose.multi.yml up -d postgres 2>&1 | grep -viE 'warn|pull|download|extract' | tail -3
for i in $(seq 1 30); do
  docker exec multi-erp-postgres pg_isready -U multi >/dev/null 2>&1 && break
  sleep 2
done
echo "postgres ready"
cat $M/multierp_globals.sql | docker exec -i multi-erp-postgres psql -U multi -d postgres >/dev/null 2>&1 || true
docker exec multi-erp-postgres psql -U multi -d postgres -tAc "SELECT datname FROM pg_database"
# baza multi_erp e creată automat de POSTGRES_DB; o recreem curat
docker exec multi-erp-postgres psql -U multi -d postgres -c 'DROP DATABASE IF EXISTS multi_erp_restore' >/dev/null 2>&1 || true
docker exec multi-erp-postgres psql -U multi -d postgres -c 'CREATE DATABASE multi_erp_restore OWNER multi' >/dev/null
cat $M/multierp_multi_erp.dump | docker exec -i multi-erp-postgres pg_restore -U multi -d multi_erp_restore --no-owner --role=multi 2>/dev/null || true
# swap: multi_erp <- multi_erp_restore
docker exec multi-erp-postgres psql -U multi -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='multi_erp'" >/dev/null
docker exec multi-erp-postgres psql -U multi -d postgres -c 'DROP DATABASE IF EXISTS multi_erp' >/dev/null
docker exec multi-erp-postgres psql -U multi -d postgres -c 'ALTER DATABASE multi_erp_restore RENAME TO multi_erp' >/dev/null
docker exec multi-erp-postgres psql -U multi -d multi_erp -tAc "SELECT 'tabele='||count(*) FROM information_schema.tables WHERE table_schema='public'"
# uploads în volumul docker
UVOL=$(docker volume ls --format '{{.Name}}' | grep multi_uploads | head -1)
if [ -n "$UVOL" ]; then
  docker run --rm -v $UVOL:/data -v $M:/backup alpine sh -c 'cd /data && tar xzf /backup/multierp_uploads.tar.gz' 2>/dev/null && echo "uploads restaurate în $UVOL" || echo "uploads gol/skip"
fi
echo MULTIERP_RESTORE_DONE
