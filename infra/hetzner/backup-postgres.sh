#!/usr/bin/env bash
# Swypik PostgreSQL backup.
# Runs on Hetzner and stores compressed dumps under /opt/swypik/backups.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/swypik/app}"
COMPOSE_FILE="${COMPOSE_FILE:-${APP_DIR}/infra/hetzner/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/infra/hetzner/.env.production}"
BACKUP_DIR="${BACKUP_DIR:-/opt/swypik/backups}"
LOG_FILE="${LOG_FILE:-/opt/swypik/logs/backup.log}"
# Keep only a few local dumps here for fast rollback. The authoritative
# history lives in /opt/swypik/backups/postgres/ (systemd backup-db.sh,
# 14-day retention) and offsite in R2 (30-day retention). Holding 14 here
# too was ~25G of pure duplication that pushed the disk to 79%.
KEEP_LAST="${KEEP_LAST:-3}"
PG_CONTAINER="${PG_CONTAINER:-swypik-prod-postgres-1}"
MIN_SIZE="${MIN_SIZE:-1048576}"
MIN_TABLES="${MIN_TABLES:-10}"
MIN_MARKETPLACE_PRODUCTS="${MIN_MARKETPLACE_PRODUCTS:-100}"

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

read_env_value() {
  local key="$1"
  local default_value="$2"
  local raw=""
  raw="$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"
  raw="${raw%$'\r'}"
  raw="${raw%\"}"
  raw="${raw#\"}"
  raw="${raw%\'}"
  raw="${raw#\'}"
  printf '%s' "${raw:-$default_value}"
}

POSTGRES_USER="${POSTGRES_USER:-$(read_env_value POSTGRES_USER swypik)}"
POSTGRES_DB="${POSTGRES_DB:-$(read_env_value POSTGRES_DB swypik)}"
TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"
BACKUP_FILE="${BACKUP_DIR}/swypik_${POSTGRES_DB}_${TIMESTAMP}.sql.gz"

log "START PostgreSQL backup: database=${POSTGRES_DB} output=${BACKUP_FILE}"

if ! docker ps --format '{{.Names}}' | grep -Fxq "$PG_CONTAINER"; then
  log "ERROR postgres container not running: $PG_CONTAINER"
  exit 1
fi

docker exec -i "$PG_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip -9 > "$BACKUP_FILE"

FILE_SIZE="$(stat -c%s "$BACKUP_FILE" 2>/dev/null || echo 0)"
if [[ "$FILE_SIZE" -lt "$MIN_SIZE" ]]; then
  rm -f "$BACKUP_FILE"
  log "ERROR backup file is too small (${FILE_SIZE} bytes < ${MIN_SIZE}); removed suspect dump"
  exit 1
fi

if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
  rm -f "$BACKUP_FILE"
  log "ERROR backup gzip integrity check failed; removed suspect dump"
  exit 1
fi

TABLES="$(zcat "$BACKUP_FILE" | grep -c '^CREATE TABLE ' || true)"
if [[ "$TABLES" -lt "$MIN_TABLES" ]]; then
  rm -f "$BACKUP_FILE"
  log "ERROR backup has only ${TABLES} tables; removed suspect dump"
  exit 1
fi

MARKETPLACE_ROWS="$(zcat "$BACKUP_FILE" | awk '
  /^COPY public.marketplace_products / { in_copy=1; next }
  in_copy && /^\\\.$/ { in_copy=0; next }
  in_copy { count++ }
  END { print count + 0 }
')"
if [[ "$MARKETPLACE_ROWS" -lt "$MIN_MARKETPLACE_PRODUCTS" ]]; then
  rm -f "$BACKUP_FILE"
  log "ERROR backup has only ${MARKETPLACE_ROWS} marketplace_products rows; removed suspect dump"
  exit 1
fi

find "$BACKUP_DIR" -maxdepth 1 -name "swypik_${POSTGRES_DB}_*.sql.gz" -type f \
  -printf '%T@ %p\n' | sort -rn | awk -v keep="$KEEP_LAST" 'NR > keep {print $2}' | xargs -r rm -f

TOTAL_BACKUPS="$(find "$BACKUP_DIR" -maxdepth 1 -name "swypik_${POSTGRES_DB}_*.sql.gz" -type f | wc -l)"
log "DONE PostgreSQL backup: size=${FILE_SIZE} bytes tables=${TABLES} marketplace_products=${MARKETPLACE_ROWS} retained=${TOTAL_BACKUPS}"
