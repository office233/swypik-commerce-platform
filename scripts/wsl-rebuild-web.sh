#!/bin/bash
set -e
cd /opt/swypik/app
export BUILD_COMMIT=$(git rev-parse --short HEAD)
export BUILD_TIME=$(date -u +%Y%m%dT%H%M%SZ)
docker compose -f infra/hetzner/docker-compose.prod.yml -f infra/hetzner/docker-compose.vps.yml -f infra/hetzner/docker-compose.minio.yml --env-file infra/hetzner/.env.production build --no-cache web-next 2>&1 | tail -20
docker compose -f infra/hetzner/docker-compose.prod.yml -f infra/hetzner/docker-compose.vps.yml -f infra/hetzner/docker-compose.minio.yml --env-file infra/hetzner/.env.production up -d web-next 2>&1 | tail -3
