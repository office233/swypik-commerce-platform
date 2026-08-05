#!/usr/bin/env bash
SEC=$(grep -m1 '^CRON_SECRET=' /opt/swypik/app/.env.production | cut -d= -f2)
echo '--- watchdog-rides (dublu, idempotenta) ---'
curl -s -w '\nstatus=%{http_code}\n' -H "x-cron-secret: $SEC" http://localhost:3005/api/cron/watchdog-rides
curl -s -w '\nstatus=%{http_code}\n' -H "x-cron-secret: $SEC" http://localhost:3005/api/cron/watchdog-rides
echo '--- reclaim-abandoned-swyp (dublu) ---'
curl -s -w '\nstatus=%{http_code}\n' -H "x-cron-secret: $SEC" http://localhost:3005/api/cron/reclaim-abandoned-swyp
curl -s -w '\nstatus=%{http_code}\n' -H "x-cron-secret: $SEC" http://localhost:3005/api/cron/reclaim-abandoned-swyp
echo '--- fara secret -> 401 ---'
curl -s -o /dev/null -w 'no-secret=%{http_code}\n' http://localhost:3005/api/cron/watchdog-rides
echo '--- run.sh din container contine reclaim? ---'
docker exec swypik-prod-cron-worker-1 grep -c 'reclaim-abandoned-swyp' /run.sh || echo 'NU (container ruleaza run.sh vechi - trebuie rebuild cron-worker)'
