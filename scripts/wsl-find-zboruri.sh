#!/bin/bash
PG=$(docker ps --format '{{.Names}}' | grep -i postgres | head -1)
echo "PG: $PG"
for DB in swypik_prod swypik; do
  docker exec "$PG" psql -U swypik -d "$DB" -tAc "SELECT 'DB='||current_database(); SELECT id||' | '||slug||' | '||name||' | parent='||COALESCE(parent_id::text,'NULL') FROM categories WHERE name ILIKE '%zbor%' OR slug ILIKE '%flight%' OR slug ILIKE '%fly%' OR slug ILIKE '%zbor%' LIMIT 10;" 2>/dev/null && break
done
