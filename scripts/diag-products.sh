#!/bin/bash
PGC=swypik-prod-postgres-1
echo "=== PRODUSE ==="
docker exec "$PGC" psql -U swypik -d swypik_prod -tAc "SELECT source_type, count(*) FROM marketplace_products GROUP BY 1 ORDER BY 2 DESC" 2>&1
echo "=== PRODUSE ACTIVE ==="
docker exec "$PGC" psql -U swypik -d swypik_prod -tAc "SELECT count(*) FROM marketplace_products WHERE status='active'" 2>&1
echo "=== VIDEOS PUBLICATE ==="
docker exec "$PGC" psql -U swypik -d swypik_prod -tAc "SELECT count(*) FROM videos WHERE status='published'" 2>&1
echo "=== ERORI RECENTE WEB ==="
docker logs swypik-prod-web-next-1 --since 10m 2>&1 | grep -iE 'error|aliexpress|marketplace_products|undefined' | head -12
echo "=== HEALTH ==="
curl -s https://swypik.com/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status'), d.get('release',{}).get('commit','?'))"
echo "=== FEED API sample ==="
curl -s 'https://swypik.com/api/explore/feed?type=shop&limit=3' | python3 -c "import sys,json; d=json.load(sys.stdin); print('items:', len(d.get('posts',d.get('items',[]))),'error:',d.get('error',''))" 2>/dev/null || echo "feed api error"
