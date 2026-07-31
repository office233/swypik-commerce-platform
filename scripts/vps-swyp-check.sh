#!/bin/bash
cd /opt/swypik/app || exit 1
PGC=swypik-prod-postgres-1
echo "== tabele swyp pe prod =="
docker exec "$PGC" psql -U swypik -d swypik_prod -tAc "SELECT tablename FROM pg_tables WHERE tablename LIKE 'swyp%' ORDER BY 1"
echo "== migrari swyp locale =="
ls db/migrations/ | grep -i swyp
echo "== reguli emisie (daca exista) =="
docker exec "$PGC" psql -U swypik -d swypik_prod -tAc "SELECT action || ' = ' || amount_units FROM swyp_emission_rules ORDER BY action" 2>&1 | head -10
