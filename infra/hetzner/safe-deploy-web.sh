#!/usr/bin/env bash
# Safe atomic deploy for the web-next container with deploy lock,
# release metadata injection, health check, post-deploy probes and rollback.
#
# Pipeline:
#   1. Acquire exclusive flock on /var/lock/swypik-deploy.lock (prevents concurrent deploys).
#   2. Tag current image as :rollback.
#   3. Build new image with BUILD_COMMIT / BUILD_TIME / DEPLOYED_AT injected.
#   4. Recreate container.
#   5. Poll /api/health until 200 AND release.commit matches HEAD (max 90s).
#   6. Post-deploy probes on EXTRA_URLS + optional Playwright health.spec.ts.
#   7. On any failure: restore :rollback tag, recreate container, exit 1.
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
LOCK_FILE="${LOCK_FILE:-/var/lock/swypik-deploy.lock}"
DEPLOYER="${DEPLOYER:-$(whoami 2>/dev/null || echo unknown)@$(hostname 2>/dev/null || echo unknown)}"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/deploy-web.log"

ts() { date '+%Y-%m-%dT%H:%M:%SZ'; }
log() { local m="[$(ts)] $*"; echo "$m"; echo "$m" >> "$LOG_FILE"; }

# ── Deploy lock (single concurrent deploy) ──
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "ERROR: another deploy is in progress (lock $LOCK_FILE held)" >&2
  log "deploy aborted: lock held by another process"
  exit 2
fi

cd "$APP_DIR"
COMMIT_LONG="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
BUILD_TIME="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
log "deploy start commit=$COMMIT deployer=$DEPLOYER service=$SERVICE"

if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  docker tag "$IMAGE" "$ROLLBACK_IMAGE"
  log "tagged previous image as $ROLLBACK_IMAGE"
fi

export BUILD_COMMIT="$COMMIT_LONG"
export BUILD_TIME="$BUILD_TIME"
export DEPLOYED_AT="$BUILD_TIME"

COMPOSE=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

log "building new image (BUILD_COMMIT=$COMMIT BUILD_TIME=$BUILD_TIME)"
"${COMPOSE[@]}" build "$SERVICE" >>"$LOG_FILE" 2>&1

log "recreating $SERVICE"
"${COMPOSE[@]}" up -d --no-deps "$SERVICE" >>"$LOG_FILE" 2>&1

ok=0
released_commit=""
for i in $(seq 1 30); do
  body=$(curl -sSk -m 5 "$HEALTH_URL" 2>/dev/null || true)
  code=$(curl -sSk -o /dev/null -m 5 -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo 000)
  released_commit=$(printf '%s' "$body" | grep -oE '"commit":"[^"]*"' | head -1 | sed 's/.*"commit":"\([^"]*\)".*/\1/')
  log "health probe $i: http=$code release.commit=${released_commit:-?}"
  if [ "$code" = "200" ] && [ -n "$released_commit" ] && [ "$released_commit" != "unknown" ]; then
    if [ "${released_commit:0:7}" = "$COMMIT" ] || [ "$released_commit" = "$COMMIT_LONG" ]; then
      ok=1
      break
    fi
  fi
  sleep 3
done

if [ "$ok" -ne 1 ]; then
  log "HEALTH FAILED after 90s (expected commit=$COMMIT, got=${released_commit:-none}). rolling back."
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

post_ok=1
for url in ${EXTRA_URLS[@]}; do
  code=$(curl -sSk -o /dev/null -m 5 -w "%{http_code}" "$url" || echo 000)
  log "extra probe $url: $code"
  if [ "$code" != "200" ]; then
    log "EXTRA PROBE FAILED at $url ($code)"
    post_ok=0
  fi
done

# Optional post-deploy E2E (skipped if SKIP_POST_E2E=1 or playwright unavailable).
if [ "${SKIP_POST_E2E:-0}" != "1" ] && [ -d "$APP_DIR/tests/e2e" ] && command -v npx >/dev/null 2>&1; then
  log "running post-deploy e2e (health.spec.ts)"
  if ( cd "$APP_DIR" && BASE_URL="https://swypik.com" npx -y playwright test tests/e2e/health.spec.ts --reporter=line >>"$LOG_FILE" 2>&1 ); then
    log "post-deploy e2e PASS"
  else
    log "post-deploy e2e FAIL (kept container running — investigate)"
    post_ok=0
  fi
fi

log "deploy ok commit=$COMMIT deployer=$DEPLOYER post_ok=$post_ok"
[ "$post_ok" -eq 1 ]
