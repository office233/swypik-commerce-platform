#!/bin/bash
set -e
cd /opt/swypik/app
echo "== pull =="
git pull --ff-only -q && git log --oneline -1
echo "== backup tabele ae_* =="
docker exec swypik-prod-postgres-1 pg_dump -U swypik -d swypik_prod -t 'ae_*' > /root/backup_ae_tables_$(date +%Y%m%d).sql 2>/dev/null || echo "(nimic de backup)"
ls -lh /root/backup_ae_tables_*.sql 2>/dev/null | tail -1
echo "== drop tabele ae_* =="
docker exec -i swypik-prod-postgres-1 psql -U swypik -d swypik_prod < scripts/db/drop-ae-tables.sql
echo "== systemd AE cleanup =="
systemctl stop swypik-ae-import.service swypik-ae-import-post-ban-guard.timer 2>/dev/null || true
systemctl disable swypik-ae-import.service swypik-ae-import-post-ban-guard.timer 2>/dev/null || true
rm -f /etc/systemd/system/swypik-ae-import.service /etc/systemd/system/swypik-ae-import-post-ban-guard.* 
systemctl daemon-reload
echo "systemd curat"
echo "== env cleanup =="
sed -i '/^ALIEXPRESS_/d; /^RAPIDAPI_/d' infra/hetzner/.env.production
grep -c ALIEXPRESS infra/hetzner/.env.production || echo "env curat"
echo "== restart cron-worker cu run.sh nou =="
docker compose -f infra/hetzner/docker-compose.prod.yml --env-file infra/hetzner/.env.production up -d cron-worker 2>&1 | tail -1 || true
echo "== deploy =="
cd infra/hetzner && bash safe-deploy-web.sh 2>&1 | grep -E 'deploy ok|FAIL'
