#!/bin/bash
cd /opt/swypik/app
docker compose -f infra/hetzner/docker-compose.prod.yml -f infra/hetzner/docker-compose.vps.yml \
  -f infra/hetzner/docker-compose.minio.yml --env-file infra/hetzner/.env.production \
  build web-next > /tmp/build-p1.log 2>&1 || true
grep -nE "Failed to compile|Module not found|Error:|error|✗|×" /tmp/build-p1.log | head -20
echo ----
grep -B3 -A8 "Failed to compile" /tmp/build-p1.log | head -40
