#!/usr/bin/env bash
# Safe atomic deploy for the web-next container with health check + rollback.
# - Tags current image as :rollback
# - Rebuilds web-next
# - Recreates the container
# - Polls /api/health until 200 (max 90s)
# - If unhealthy, restores :rollback tag and recreates the container again
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/swypik/app}"
COMPOSE_FILE="${COMPOSE_FILE:-${APP_DIR}/infra/hetzner/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/infra/hetzner/.env.production}"
SERVICE="${SERVICE:-web-next}"
IMAGE="${IMAGE:-swypik-prod-web-next:latest}"
ROLLBACK_IMAGE="${ROLLBACK_IMAGE:-swypik-prod-web-next:rollback}"
HEALTH_URL="${HEALTH_URL:-https://swypik.com/api/health}"
EXTRA_URLS=("${EXTRA_URLS[@]:-https://swypik.com/ https://swypik.com/sitemap.xml}")
LOG_DIR="${LOG_DIR:-/opt/swypik/logs}"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/deploy-web.log"

ts() { date '+%Y-%m-%dT%H:%M:%SZ'; }
log() { local m="[$(ts)] $*"; echo "$m"; echo "$m" >> "$LOG_FILE"; }

cd "$APP_DIR"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
log "deploy start commit=$COMMIT service=$SERVICE"

if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  docker tag "$IMAGE" "$ROLLBACK_IMAGE"
  log "tagged previous image as $ROLLBACK_IMAGE"
fi

COMPOSE=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

log "building new image"
"${COMPOSE[@]}" build "$SERVICE" >>"$LOG_FILE" 2>&1

log "recreating $SERVICE"
"${COMPOSE[@]}" up -d --no-deps "$SERVICE" >>"$LOG_FILE" 2>&1

ok=0
for i in $(seq 1 30); do
  code=$(curl -sSk -o /dev/null -m 5 -w "%{http_code}" "$HEALTH_URL" || echo 000)
  log "health probe $i: $code"
  if [ "$code" = "200" ]; then ok=1; break; fi
  sleep 3
done

if [ "$ok" -ne 1 ]; then
  log "HEALTH FAILED after 90s. rolling back."
  if docker image inspect "$ROLLBACK_IMAGE" >/dev/null 2>&1; then
    docker tag "$ROLLBACK_IMAGE" "$IMAGE"
    "${COMPOSE[@]}" up -d --no-deps --force-recreate "$SERVICE" >>"$LOG_FILE" 2>&1 || true
    for i in $(seq 1 20); do
      code=$(curl -sSk -o /dev/null -m 5 -w "%{http_code}" "$HEALTH_URL" || echo 000)
      log "rollback probe $i: $code"
      if [ "$code" = "200" ]; then break; fi
      sleep 3
    done
    log "rollback finished"
  else
    log "no rollback image available, aborting"
  fi
  exit 1
fi

for url in ${EXTRA_URLS[@]}; do
  code=$(curl -sSk -o /dev/null -m 5 -w "%{http_code}" "$url" || echo 000)
  log "extra probe $url: $code"
  if [ "$code" != "200" ]; then
    log "EXTRA PROBE FAILED at $url ($code). investigate, container kept running."
  fi
done

log "deploy ok commit=$COMMIT"
