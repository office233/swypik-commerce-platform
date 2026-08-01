#!/bin/bash
echo '=== Servicii definite în compose-urile swypik ==='
cd /opt/swypik/app
docker compose -f infra/hetzner/docker-compose.prod.yml -f infra/hetzner/docker-compose.vps.yml -f infra/hetzner/docker-compose.minio.yml --env-file infra/hetzner/.env.production config --services 2>/dev/null
echo '=== Ce ruleaza local ==='
docker ps --format '{{.Names}}'
echo '=== Compose-uri chain ==='
ls /opt/swypik-chain/docker-compose*.yml
echo '=== Caddy/proxy pe VPS? ==='
ls /opt/swypik/app/infra/hetzner/Caddyfile 2>/dev/null && head -40 /opt/swypik/app/infra/hetzner/Caddyfile
