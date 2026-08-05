#!/usr/bin/env bash
# Ia CRON_SECRET exact cum îl vede containerul web
SEC=$(docker exec swypik-prod-web-next-1 printenv CRON_SECRET)
echo "len=${#SEC}"
echo '--- watchdog-rides (dublu, idempotenta) ---'
curl -s -w '\nstatus=%{http_code}\n' -H "x-cron-secret: $SEC" http://localhost:3005/api/cron/watchdog-rides
curl -s -w '\nstatus=%{http_code}\n' -H "x-cron-secret: $SEC" http://localhost:3005/api/cron/watchdog-rides
echo '--- reclaim-abandoned-swyp (dublu) ---'
curl -s -w '\nstatus=%{http_code}\n' -H "authorization: Bearer $SEC" http://localhost:3005/api/cron/reclaim-abandoned-swyp
curl -s -w '\nstatus=%{http_code}\n' -H "authorization: Bearer $SEC" http://localhost:3005/api/cron/reclaim-abandoned-swyp
