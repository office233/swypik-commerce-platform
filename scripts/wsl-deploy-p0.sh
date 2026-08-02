#!/bin/bash
set -e
cd /opt/swypik/app
git pull -q origin main
echo '== 1. Migrare seed pricing_zones =='
PGC=$(docker ps --format '{{.Names}}' | grep -E 'swypik-prod-postgres' | head -1)
cat db/migrations/20260802_0001_seed_pricing_zones.sql | docker exec -i $PGC psql -U swypik -d swypik_prod 2>&1 | tail -1
docker exec $PGC psql -U swypik -d swypik_prod -tAc "SELECT city||'/'||kind||'/'||vehicle_class FROM pricing_zones WHERE active ORDER BY city,kind" | head -20

echo '== 2. Dispatch worker service =='
sed 's/\r//' scripts/wsl-install-dispatch-service.sh > /tmp/ds.sh && bash /tmp/ds.sh

echo '== 3. MediaMTX =='
docker compose -f infra/hetzner/docker-compose.prod.yml -f infra/hetzner/docker-compose.vps.yml \
  -f infra/hetzner/docker-compose.minio.yml --env-file infra/hetzner/.env.production \
  up -d mediamtx 2>&1 | grep -viE 'warn|pull|download|extract' | tail -2
sleep 5
docker ps --format '{{.Names}}\t{{.Status}}' | grep -E 'mediamtx|dispatch' || true
curl -s -o /dev/null -w 'mediamtx api: %{http_code}\n' -m 5 http://127.0.0.1:9997/v3/config/global/get || true
echo P0_DEPLOY_DONE
