#!/bin/bash
# Backup COMPLET swypik + multi-erp de pe VPS -> /root/migrate/
# NU atinge nimic meister-*.
set -e
OUT=/root/migrate
mkdir -p $OUT
cd $OUT

echo "== 1. Dump Postgres swypik_prod =="
docker exec swypik-prod-postgres-1 pg_dump -U swypik -Fc swypik_prod > swypik_prod.dump
docker exec swypik-prod-postgres-1 pg_dumpall -U swypik --globals-only > swypik_globals.sql

echo "== 2. Dump Postgres multi-erp =="
docker exec multi-erp-postgres pg_dump -U multi -Fc multi_erp > multierp_multi_erp.dump
docker exec multi-erp-postgres pg_dumpall -U multi --globals-only > multierp_globals.sql

echo "== 3. Dump Postgres blockscout =="
docker exec swypik-bs-postgres pg_dumpall -U postgres > blockscout_full.sql || echo "WARN: blockscout dump failed (non-critic, se poate reindexa)"

echo "== 4. Chaindata geth (oprire scurta pentru consistenta) =="
docker stop swypik-chain swypik-chain-rpc
tar czf swypik-chain-dir.tar.gz -C /opt swypik-chain
docker start swypik-chain swypik-chain-rpc

echo "== 5. MinIO data (media) =="
tar czf swypik-minio-data.tar.gz -C /var/lib/docker/volumes/swypik-prod_swypik_minio_data/_data .

echo "== 6. Repo dirs cu env-uri si config =="
tar czf swypik-app-dir.tar.gz -C /opt swypik
tar czf multi-erp-dir.tar.gz -C /opt multi-erp

echo "== 7. Uploads multi-erp =="
tar czf multierp_uploads.tar.gz -C /var/lib/docker/volumes/multi-erp_multi_uploads/_data . 2>/dev/null || echo "uploads gol"

echo "== 8. Cron + scripturi sistem =="
crontab -l > root_crontab.txt
cp /usr/local/bin/swypik-chain-health.sh /usr/local/bin/swypik-peer-watchdog.sh . 2>/dev/null || true

echo "== 9. Redis (best effort) =="
docker exec swypik-prod-redis-1 redis-cli BGSAVE >/dev/null 2>&1 && sleep 2 && \
  docker cp swypik-prod-redis-1:/data/dump.rdb swypik_redis.rdb 2>/dev/null || echo "redis skip"

echo "== 10. Checksums + listing =="
md5sum * > MD5SUMS.txt 2>/dev/null || true
ls -lh $OUT
df -h / | tail -1
echo "BACKUP_DONE"
