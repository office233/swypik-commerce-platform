#!/bin/bash
cd /opt/swypik/app || exit 1
echo "---CONTAINERS---"
docker compose ps --format '{{.Name}} {{.Status}}' 2>/dev/null | head -8
PG=$(docker ps -qf name=postgres | head -1)
echo "---TABLES---"
docker exec "$PG" psql -U swypik -d swypik_prod -tAc "SELECT tablename FROM pg_tables WHERE tablename IN ('dispatch_jobs','pricing_zones','wallet_ledger_entries','ride_ratings','payout_requests','user_push_tokens') ORDER BY 1"
echo "---ZONES---"
docker exec "$PG" psql -U swypik -d swypik_prod -tAc "SELECT city||' '||kind||' '||vehicle_class FROM pricing_zones LIMIT 8" 2>&1
echo "---RIDES-COLS---"
docker exec "$PG" psql -U swypik -d swypik_prod -tAc "SELECT column_name FROM information_schema.columns WHERE table_name='rides' AND column_name IN ('job_id','vehicle_class','fare_breakdown','payment_method')"
echo "---ENV-KEYS---"
grep -E '^(VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY|CRON_SECRET|NEXT_PUBLIC_VAPID)' .env .env.local .env.production 2>/dev/null | sed 's/=.*/=SET/'
echo "---CRON---"
crontab -l 2>/dev/null | grep -iE 'dispatch|cron-tick' || echo "NO dispatch cron"
echo "---HEALTH---"
curl -s -o /dev/null -w 'https 200check: %{http_code}\n' https://swypik.com/ro/go
curl -s -o /dev/null -w 'rides estimate: %{http_code}\n' -X POST https://swypik.com/api/rides/estimate -H 'content-type: application/json' -d '{"pickup":{"lat":44.4268,"lng":26.1025,"address":"Universitate"},"dropoff":{"lat":44.4515,"lng":26.0855,"address":"Aviatorilor"}}'
