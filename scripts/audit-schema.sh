#!/bin/bash
Q() { docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -t -A -F'|' -c "$1" 2>&1; }

echo "=== TABELE SWYP / ORDERS ==="
Q "select table_name from information_schema.tables where table_schema='public' and (table_name like 'swyp%' or table_name like '%order%' or table_name like '%payment%' or table_name like '%transaction%') order by 1;"

echo ""
echo "=== ROWCOUNT PE TABELE SWYP ==="
for t in $(docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -t -A -c "select table_name from information_schema.tables where table_schema='public' and table_name like 'swyp%';" 2>/dev/null); do
  n=$(docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -t -A -c "select count(*) from \"$t\";" 2>/dev/null)
  echo "$t = $n"
done

echo ""
echo "=== ORDERS: coloane ==="
Q "select column_name from information_schema.columns where table_name='orders' order by ordinal_position;"

echo ""
echo "=== ORDERS: rowcount + status ==="
Q "select status, count(*) from orders group by status;"
