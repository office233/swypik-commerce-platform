#!/bin/bash
# Rulează IDENTIC pe VPS și local — produce output comparabil
echo '=== A. swypik_prod: rânduri per tabel (top 30) ==='
PGC=$(docker ps --format '{{.Names}}' | grep -E 'swypik-prod-postgres|^postgres' | head -1)
docker exec $PGC psql -U swypik -d swypik_prod -tAc "
SELECT relname||'='||n_live_tup FROM pg_stat_user_tables ORDER BY relname" | sort | head -60

echo '=== B. multi_erp: numar tabele + users ==='
docker exec multi-erp-postgres psql -U multi -d multi_erp -tAc "SELECT 'tabele='||count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null

echo '=== C. MinIO: obiecte per bucket ==='
MC=$(docker ps --format '{{.Names}}' | grep minio | head -1)
docker exec $MC sh -c 'du -s /data/* 2>/dev/null | grep -v ".minio.sys"' | awk '{print $2"="$1}'

echo '=== D. Chain: block number ==='
docker exec swypik-chain geth attach --exec 'eth.blockNumber' /data/geth.ipc 2>/dev/null

echo '=== E. env checksums ==='
md5sum /opt/swypik/app/infra/hetzner/.env.production /opt/multi-erp/.env 2>/dev/null | awk '{print $1" "$2}'

echo '=== F. keystore chain ==='
ls /opt/swypik-chain/data/keystore/ 2>/dev/null | head -3
md5sum /opt/swypik-chain/genesis.json /opt/swypik-chain/password.txt 2>/dev/null | awk '{print $1}'
