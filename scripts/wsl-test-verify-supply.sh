#!/bin/bash
cd /opt/swypik/app
SECRET=$(grep '^CRON_SECRET=' infra/hetzner/.env.production | cut -d= -f2)
sleep 15
echo "== health =="
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3005/en
echo "== verify-supply =="
curl -s -X POST -H "x-cron-secret: $SECRET" http://127.0.0.1:3005/api/cron/verify-supply
echo
echo "== unauthorized check =="
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3005/api/cron/verify-supply
echo "== checkpoint in db =="
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tc "SELECT value FROM platform_config WHERE key='swyp_hashchain_checkpoint';"
