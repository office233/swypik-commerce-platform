#!/bin/bash
# Audit profitabilitate SWYP - date reale din productie
PSQL="docker exec swypik-prod-postgres-1 psql -U swypik -d swypik -t -A -F| -c"

echo "=== USERI ==="
$PSQL "select count(*) from users;" 2>/dev/null || echo "N/A"

echo "=== SOLDURI SWYP USERI (subunitati) ==="
$PSQL "select coalesce(sum(balance_units),0), count(*) from swyp_balances where balance_units>0;" 2>/dev/null || echo "N/A"

echo "=== FOND ACOPERIRE (cents) ==="
$PSQL "select coalesce(sum(amount_cents),0) from swyp_backing_fund;" 2>/dev/null || echo "N/A"

echo "=== LEDGER: emisiuni pe actiune ==="
$PSQL "select reason, count(*), sum(amount_units) from swyp_ledger where amount_units>0 group by reason order by 3 desc limit 15;" 2>/dev/null || echo "N/A"

echo "=== COMENZI PLATITE (total, suma cents) ==="
$PSQL "select count(*), coalesce(sum(total_cents),0) from orders where status in ('paid','completed','delivered');" 2>/dev/null || echo "N/A"

echo "=== COMISION PLATFORMA INCASAT ==="
$PSQL "select count(*), coalesce(sum(commission_cents),0) from orders where commission_cents is not null;" 2>/dev/null || echo "N/A"

echo "=== STAKING ACTIV ==="
$PSQL "select status, count(*), sum(amount_units) from swyp_stakes group by status;" 2>/dev/null || echo "N/A"

echo "=== WITHDRAWALS ==="
$PSQL "select status, count(*), sum(amount_units) from swyp_withdrawals group by status;" 2>/dev/null || echo "N/A"

echo "=== CONFIG ACTUAL ==="
$PSQL "select key, value from swyp_config order by key;" 2>/dev/null || echo "N/A"

echo "=== CURS SWYP ==="
$PSQL "select * from swyp_rate_history order by created_at desc limit 3;" 2>/dev/null || echo "N/A"
