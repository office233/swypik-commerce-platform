#!/usr/bin/env bash
# Pornește toate containerele oprite, în ordinea corectă (DB/cache întâi).
set -u

echo "=== 1. Baze de date & cache ==="
for c in swypik-prod-postgres-1 meister-postgres multi-erp-postgres swypik-prod-redis-1 meister-redis swypik-minio; do
  docker start "$c" >/dev/null 2>&1 && echo "  started $c" || echo "  SKIP $c"
done
sleep 20

echo "=== 2. Aplicații ==="
for c in swypik-prod-web-next-1 swypik-prod-platform-api-1 swypik-prod-cron-worker-1 \
         swypik-prod-video-worker-1 swypik-prod-video-worker-2 swypik-prod-video-worker-3 \
         meister-backend multi-erp-backend meister-storefront meister-shopfront; do
  docker start "$c" >/dev/null 2>&1 && echo "  started $c" || echo "  SKIP $c"
done
sleep 10

echo "=== 3. Proxy & monitorizare ==="
for c in meister-nginx meister-grafana meister-prometheus; do
  docker start "$c" >/dev/null 2>&1 && echo "  started $c" || echo "  SKIP $c"
done

sleep 15
echo ""
echo "=== REZULTAT ==="
docker ps --format '{{.Names}}\t{{.Status}}' | sort
echo ""
echo "pornite: $(docker ps -q | wc -l) / total: $(docker ps -aq | wc -l)"
