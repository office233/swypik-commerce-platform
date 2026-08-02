#!/bin/bash
set -e
cd /opt/swypik/app
# NEXT_PUBLIC_* sunt inline la build → rebuild necesar
docker compose -f infra/hetzner/docker-compose.prod.yml -f infra/hetzner/docker-compose.vps.yml \
  -f infra/hetzner/docker-compose.minio.yml --env-file infra/hetzner/.env.production \
  up -d --build web-next > /tmp/build-p2.log 2>&1 \
  && echo BUILD_OK || { echo BUILD_FAIL; grep -E 'Failed|Error' /tmp/build-p2.log | head -5; exit 1; }
sleep 10
curl -s -o /dev/null -w 'health: %{http_code}\n' -m 20 http://localhost:3005/api/health
echo '== verificare push config =='
docker exec swypik-prod-web-next-1 sh -c 'test -n "$VAPID_PUBLIC_KEY" && echo VAPID_SET || echo VAPID_MISSING'
docker exec swypik-prod-web-next-1 sh -c 'echo "PUSH=$FEATURE_PUSH_NOTIFICATIONS DM=$FEATURE_DM"'
echo P2_DEPLOY_DONE
