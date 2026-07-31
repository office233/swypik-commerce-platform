#!/bin/bash
set -e
cd /opt/swypik/app
sudo -u deploy git pull -q origin main 2>/dev/null || git pull -q origin main
echo "== migrare founding drivers =="
docker exec -i swypik-prod-postgres-1 psql -U swypik -d swypik_prod -v ON_ERROR_STOP=0 < db/migrations/20260730_0022_founding_drivers.sql 2>&1 | grep -E 'ERROR|CREATE|ALTER|INSERT' | head -8 || true
echo "== verificare =="
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tAc "SELECT key, value FROM platform_config"
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tAc "SELECT count(*) FROM information_schema.columns WHERE table_name='couriers' AND column_name IN ('commission_tier','promo_zero_until','tier_rides_count')"
echo "== cron daily-maintenance =="
SEC=$(grep '^CRON_SECRET=' infra/hetzner/.env.production | cut -d= -f2)
CRONLINE="15 4 * * * curl -s -o /dev/null -H \"x-cron-secret: $SEC\" https://swypik.com/api/cron/daily-maintenance # daily-maintenance"
( crontab -l 2>/dev/null | grep -v daily-maintenance; echo "$CRONLINE" ) | crontab -
crontab -l | grep -c 'daily-maintenance\|dispatch-tick'
echo "== deploy =="
cd infra/hetzner && bash safe-deploy-web.sh 2>&1 | grep -E 'deploy ok|a11y|e2e|perf|forms'
