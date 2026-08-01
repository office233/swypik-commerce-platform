#!/bin/bash
# Pornește serviciile rămase: platform-api, video-worker, blockscout, multi-erp backend
set -e
cd /opt/swypik/app
COMPOSE="docker compose -f infra/hetzner/docker-compose.prod.yml -f infra/hetzner/docker-compose.vps.yml -f infra/hetzner/docker-compose.minio.yml --env-file infra/hetzner/.env.production"
echo '== platform-api + video-worker =='
$COMPOSE up -d platform-api video-worker 2>&1 | grep -viE 'warn|pull|download|extract' | tail -4

echo '== blockscout (postgres + app) =='
cd /opt/swypik-chain
# restaurăm întâi bs-data dacă e nevoie — dar avem folderul bs-data copiat deja cu tot cu date
docker compose -f docker-compose.blockscout.yml up -d 2>&1 | grep -viE 'warn|pull|download|extract' | tail -4

echo '== multi-erp backend (build + up) =='
cd /opt/multi-erp
docker compose -f docker-compose.multi.yml up -d --build backend 2>&1 | grep -viE 'warn|pull|download|extract|^#' | tail -6

sleep 10
docker ps --format '{{.Names}}\t{{.Status}}'
