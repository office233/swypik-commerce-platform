#!/bin/bash
set -e
cd /opt/swypik/app
F=infra/hetzner/safe-deploy-web.sh
# adaugă COMPOSE_OVERRIDE după linia COMPOSE_FILE
grep -q 'COMPOSE_OVERRIDE' "$F" || sed -i '/^COMPOSE_FILE=/a COMPOSE_OVERRIDE="${COMPOSE_OVERRIDE:-${APP_DIR}/infra/hetzner/docker-compose.vps.yml}"' "$F"
# include override-ul în comanda compose
sed -i 's|^COMPOSE=(docker compose -f "\$COMPOSE_FILE" --env-file "\$ENV_FILE")|COMPOSE=(docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" --env-file "$ENV_FILE")|' "$F"
grep -n 'COMPOSE_FILE=\|COMPOSE_OVERRIDE=\|COMPOSE=(' "$F"
bash -n "$F" && echo "SYNTAX OK"
