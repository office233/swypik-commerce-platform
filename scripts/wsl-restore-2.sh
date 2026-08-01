#!/bin/bash
# Pașii 2-4 din restore, fără set -e strict pe curl
M=/mnt/e/vps-migrate
set -e

echo "== 2. Postgres + Redis + MinIO =="
cd /opt/swypik/app
COMPOSE="docker compose -f infra/hetzner/docker-compose.prod.yml -f infra/hetzner/docker-compose.vps.yml -f infra/hetzner/docker-compose.minio.yml --env-file infra/hetzner/.env.production"
$COMPOSE up -d postgres redis minio 2>&1 | grep -vE 'Pulling|Pulled|Downloading|Extracting|Waiting|Download' | tail -5
echo "waiting for postgres..."
PGC=""
for i in $(seq 1 30); do
  PGC=$(docker ps --format '{{.Names}}' | grep postgres | grep -v bs | grep -v multi | head -1)
  [ -n "$PGC" ] && docker exec $PGC pg_isready -U swypik >/dev/null 2>&1 && break
  sleep 2
done
echo "  container: $PGC"

echo "== 3. Restore swypik_prod =="
cat $M/swypik_globals.sql | docker exec -i $PGC psql -U swypik -d postgres >/dev/null 2>&1 || true
docker exec $PGC psql -U swypik -d postgres -c 'DROP DATABASE IF EXISTS swypik_prod' >/dev/null 2>&1 || true
docker exec $PGC psql -U swypik -d postgres -c 'CREATE DATABASE swypik_prod OWNER swypik' >/dev/null
cat $M/swypik_prod.dump | docker exec -i $PGC pg_restore -U swypik -d swypik_prod --no-owner --role=swypik 2>/dev/null || true
docker exec $PGC psql -U swypik -d swypik_prod -tAc "SELECT 'users='||count(*) FROM users"
docker exec $PGC psql -U swypik -d swypik_prod -tAc "SELECT 'videos='||count(*) FROM videos"

echo "== 4. Restore MinIO =="
MINIOVOL=$(docker volume ls --format '{{.Name}}' | grep minio_data | head -1)
echo "  volum: $MINIOVOL"
docker run --rm -v $MINIOVOL:/data -v $M:/backup alpine sh -c 'cd /data && tar xzf /backup/swypik-minio-data.tar.gz' 
docker restart $(docker ps -a --format '{{.Names}}' | grep minio | head -1) >/dev/null

echo "== 5. Chain check =="
sleep 3
curl -s -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://localhost:8545 || echo "chain rpc inca porneste"
echo
echo RESTORE_CORE_DONE
