#!/usr/bin/env bash
# Swypik PostgreSQL backup.
# Runs on Hetzner and stores compressed dumps under /opt/swypik/backups.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/swypik/app}"
COMPOSE_FILE="${COMPOSE_FILE:-${APP_DIR}/infra/hetzner/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/infra/hetzner/.env.production}"
BACKUP_DIR="${BACKUP_DIR:-/opt/swypik/backups}"
LOG_FILE="${LOG_FILE:-/opt/swypik/logs/backup.log}"
KEEP_LAST="${KEEP_LAST:-14}"

mkdir -p "$BACKUP_DIR" "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

if [[ ! -f "$COMPOSE_FILE" ]]; then
  log "ERROR compose file not found: $COMPOSE_FILE"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  log "ERROR env file not found: $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

POSTGRES_USER="${POSTGRES_USER:-swypik}"
POSTGRES_DB="${POSTGRES_DB:-swypik}"
TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"
BACKUP_FILE="${BACKUP_DIR}/swypik_${POSTGRES_DB}_${TIMESTAMP}.sql.gz"

log "START PostgreSQL backup: database=${POSTGRES_DB} output=${BACKUP_FILE}"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip -9 > "$BACKUP_FILE"

FILE_SIZE="$(stat -c%s "$BACKUP_FILE" 2>/dev/null || echo 0)"
if [[ "$FILE_SIZE" -lt 100 ]]; then
  rm -f "$BACKUP_FILE"
  log "ERROR backup file is too small (${FILE_SIZE} bytes); removed suspect dump"
  exit 1
fi

find "$BACKUP_DIR" -maxdepth 1 -name "swypik_${POSTGRES_DB}_*.sql.gz" -type f \
  -printf '%T@ %p\n' | sort -rn | awk -v keep="$KEEP_LAST" 'NR > keep {print $2}' | xargs -r rm -f

TOTAL_BACKUPS="$(find "$BACKUP_DIR" -maxdepth 1 -name "swypik_${POSTGRES_DB}_*.sql.gz" -type f | wc -l)"
log "DONE PostgreSQL backup: size=${FILE_SIZE} bytes retained=${TOTAL_BACKUPS}"
