#!/bin/bash
Q() { docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -t -A -F'|' -c "$1" 2>&1; }
echo "=== TREASURY POOLS ==="
Q "select * from swyp_treasury_pools;"
echo "=== CONFIG STAKING ==="
Q "select key, value from platform_config where key like '%swyp%';"
