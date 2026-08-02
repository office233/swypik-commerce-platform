#!/bin/bash
set -e
cd /opt/swypik/app
git checkout -- messages/en.json messages/ro.json
bash /tmp/jc.sh 2>/dev/null | grep -E 'OK|BAD' || true
echo '== rebuild web-next =='
docker compose -f infra/hetzner/docker-compose.prod.yml -f infra/hetzner/docker-compose.vps.yml \
  -f infra/hetzner/docker-compose.minio.yml --env-file infra/hetzner/.env.production \
  up -d --build web-next > /tmp/build-p1b.log 2>&1 \
  && echo BUILD_OK || { echo BUILD_FAIL; grep -E 'Failed|Error' /tmp/build-p1b.log | head -5; exit 1; }
sleep 10
curl -s -o /dev/null -w 'health: %{http_code}\n' -m 20 http://localhost:3005/api/health
echo '== verificari P1 =='
CS=$(grep -E '^CRON_SECRET=' infra/hetzner/.env.production | cut -d= -f2 | tr -d '"')
echo '-- view-milestones:'
curl -s -H "x-cron-secret: $CS" http://localhost:3005/api/cron/swyp-view-milestones | head -c 150
echo
echo '-- missions submit (astept 401):'
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3005/api/missions/test/submit -H 'Content-Type: application/json' -d '{}'
echo '-- activity (astept 401):'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3005/api/me/activity
echo P1_REDEPLOY_DONE
