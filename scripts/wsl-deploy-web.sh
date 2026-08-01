#!/bin/bash
set -e
cd /opt/swypik/app
git pull --ff-only 2>&1 | tail -1
docker compose -f infra/hetzner/docker-compose.prod.yml -f infra/hetzner/docker-compose.vps.yml -f infra/hetzner/docker-compose.minio.yml --env-file infra/hetzner/.env.production up -d --build web-next 2>&1 | tail -3
