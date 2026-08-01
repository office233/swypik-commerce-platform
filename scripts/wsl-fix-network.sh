#!/bin/bash
set -e
cd /opt/swypik-chain
docker compose -f docker-compose.yml down
docker compose -f docker-compose.rpc.yml down
docker network rm swypik-prod_default 2>/dev/null || true

cd /opt/swypik/app
docker compose -f infra/hetzner/docker-compose.prod.yml -f infra/hetzner/docker-compose.vps.yml \
  -f infra/hetzner/docker-compose.minio.yml --env-file infra/hetzner/.env.production \
  up -d postgres redis minio 2>&1 | grep -v level=warning | tail -4

cd /opt/swypik-chain
docker compose -f docker-compose.yml up -d
docker compose -f docker-compose.rpc.yml up -d
sleep 6
docker ps --format '{{.Names}}\t{{.Status}}'
