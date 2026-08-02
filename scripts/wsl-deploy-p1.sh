#!/bin/bash
set -e
cd /opt/swypik/app
git pull -q origin main
echo '== migrari =='
PGC=$(docker ps --format '{{.Names}}' | grep -E 'swypik-prod-postgres' | head -1)
for m in 20260802_0002_mission_prize_rule.sql 20260802_0003_stay_bookings_intent.sql; do
  echo "-- $m"
  cat db/migrations/$m | docker exec -i $PGC psql -U swypik -d swypik_prod 2>&1 | tail -1
done
echo '== rebuild web-next =='
docker compose -f infra/hetzner/docker-compose.prod.yml -f infra/hetzner/docker-compose.vps.yml \
  -f infra/hetzner/docker-compose.minio.yml --env-file infra/hetzner/.env.production \
  up -d --build web-next 2>&1 | grep -E 'Compiled|Failed|error|Started|Healthy' | tail -4
sleep 8
curl -s -o /dev/null -w 'health: %{http_code}\n' -m 20 http://localhost:3005/api/health
echo '== verificari P1 =='
CS=$(grep -E '^CRON_SECRET=' infra/hetzner/.env.production | cut -d= -f2 | tr -d '"')
curl -s -H "x-cron-secret: $CS" http://localhost:3005/api/cron/swyp-view-milestones | head -c 200
echo
curl -s -o /dev/null -w 'missions submit (fara auth, astept 401): %{http_code}\n' -X POST http://localhost:3005/api/missions/test/submit -H 'Content-Type: application/json' -d '{}'
echo P1_DEPLOY_DONE
