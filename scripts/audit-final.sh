#!/bin/bash
Q() { docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -t -A -F'|' -c "$1" 2>&1; }

echo "=== COMMERCE ORDERS ==="
Q "select status, count(*), coalesce(sum(total_cents),0) from commerce_orders group by status;"
echo "=== PAYMENT TRANSACTIONS ==="
Q "select status, count(*), coalesce(sum(amount_cents),0) from payment_transactions group by status;"
echo "=== BACKING FUND ==="
Q "select * from swyp_backing_fund;"
echo "=== EMISSION RULES ==="
Q "select * from swyp_emission_rules;"
echo "=== TREASURY POOLS ==="
Q "select * from swyp_treasury_pools;"
echo "=== MINING SESSIONS ==="
Q "select count(*), min(started_at), max(started_at) from swyp_mining_sessions;"
