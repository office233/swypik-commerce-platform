#!/bin/bash
# Restore + pornire stack Swypik local în WSL. Rulat ca dev.
set -e
M=/mnt/e/vps-migrate

echo "== 1. Chain geth (validator + rpc) =="
cd /opt/swypik-chain
docker compose -f docker-compose.yml up -d
docker compose -f docker-compose.rpc.yml up -d
sleep 8
curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://localhost:8545
echo

echo "== 2. Postgres + Redis + MinIO (din compose prod) =="
cd /opt/swypik/app
COMPOSE="docker compose -f infra/hetzner/docker-compose.prod.yml -f infra/hetzner/docker-compose.vps.yml -f infra/hetzner/docker-compose.minio.yml --env-file infra/hetzner/.env.production"
$COMPOSE up -d postgres redis minio
sleep 10
docker ps --format '{{.Names}} {{.Status}}'

echo "== 3. Restore Postgres swypik_prod =="
PGC=$(docker ps --format '{{.Names}}' | grep postgres | grep -v bs | grep -v multi | head -1)
echo "  container: $PGC"
docker exec -i $PGC psql -U swypik -d postgres -c 'SELECT 1' >/dev/null
cat $M/swypik_globals.sql | docker exec -i $PGC psql -U swypik -d postgres >/dev/null 2>&1 || true
docker exec $PGC psql -U swypik -d postgres -c 'DROP DATABASE IF EXISTS swypik_prod' 2>/dev/null || true
docker exec $PGC psql -U swypik -d postgres -c 'CREATE DATABASE swypik_prod OWNER swypik'
cat $M/swypik_prod.dump | docker exec -i $PGC pg_restore -U swypik -d swypik_prod --no-owner --role=swypik 2>&1 | grep -c error || true
docker exec $PGC psql -U swypik -d swypik_prod -tAc 'SELECT count(*) FROM users; SELECT count(*) FROM videos;'

echo "== 4. Restore MinIO data =="
MINIOVOL=$(docker volume ls --format '{{.Name}}' | grep minio_data | head -1)
echo "  volum: $MINIOVOL"
docker run --rm -v $MINIOVOL:/data -v $M:/backup alpine sh -c 'cd /data && tar xzf /backup/swypik-minio-data.tar.gz'
docker restart $(docker ps --format '{{.Names}}' | grep minio | head -1)

echo "== RESTORE_CORE_DONE =="
