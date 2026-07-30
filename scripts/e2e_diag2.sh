#!/usr/bin/env bash
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tAc "SELECT string_agg(column_name, ',') FROM information_schema.columns WHERE table_name='sellers'"
echo "--- web logs ---"
docker logs swypik-prod-web-next-1 --tail 60 2>&1 | grep -iE 'partner|error' | tail -12
echo "--- marketplace_products cols ---"
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tAc "SELECT string_agg(column_name, ',') FROM information_schema.columns WHERE table_name='marketplace_products'"
