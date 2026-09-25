#!/usr/bin/env bash
# Backup nocturn PostgreSQL → Cloudflare R2 (sau orice S3-compatibil), cu retenție.
#   pg_dump | gzip | aws s3 cp - s3://<bucket>/<prefix><db>_<ts>.sql.gz
# Nimic nu se scrie pe discul local (stream), deci merge pe VM-uri stateless.
# Documentație + cron: docs/infra/r2.md („Backup nocturn al bazei de date”).
#
# Env (obligatorii):
#   DATABASE_URL            conexiunea Postgres (sau PG_DUMP_CMD, vezi mai jos)
#   BACKUP_S3_BUCKET        bucket-ul de backup (separat de media, privat)
#   BACKUP_S3_ENDPOINT      ex. https://<account-id>.r2.cloudflarestorage.com
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY   token R2 limitat la bucket-ul de backup
# Env (opționale):
#   BACKUP_S3_PREFIX        implicit "postgres/"
#   BACKUP_RETENTION_DAYS   implicit 14; 0 = fără ștergere din script (regulă lifecycle R2)
#   BACKUP_NAME             implicit "swypik"
#   PG_DUMP_CMD             implicit "pg_dump"; ex. "docker exec swypik-prod-postgres-1 pg_dump"
#   AWS_REGION              implicit "auto" (R2)
#   LOCK_FILE               implicit /tmp/swypik-db-backup.lock
# Argumente: --dry-run  (doar afișează ce ar face)
set -euo pipefail

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }
fail() { log "ERROR: $*"; exit 1; }

: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET lipsește}"
: "${BACKUP_S3_ENDPOINT:?BACKUP_S3_ENDPOINT lipsește}"
PREFIX="${BACKUP_S3_PREFIX:-postgres/}"
PREFIX="${PREFIX%/}/"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
NAME="${BACKUP_NAME:-swypik}"
PG_DUMP_CMD="${PG_DUMP_CMD:-pg_dump}"
LOCK_FILE="${LOCK_FILE:-/tmp/swypik-db-backup.lock}"
export AWS_REGION="${AWS_REGION:-auto}"
# aws-cli v2 recent calculează implicit checksum-uri CRC la upload în flux;
# R2 le acceptă doar pe unele operații — le cerem doar când sunt obligatorii.
export AWS_REQUEST_CHECKSUM_CALCULATION="${AWS_REQUEST_CHECKSUM_CALCULATION:-when_required}"
export AWS_RESPONSE_CHECKSUM_VALIDATION="${AWS_RESPONSE_CHECKSUM_VALIDATION:-when_required}"

[[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || fail "BACKUP_RETENTION_DAYS trebuie să fie un număr"
command -v aws >/dev/null || fail "aws-cli lipsește (https://docs.aws.amazon.com/cli/)"
command -v gzip >/dev/null || fail "gzip lipsește"

s3() { aws --endpoint-url "$BACKUP_S3_ENDPOINT" "$@"; }

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "backup sărit: rulează deja altul"
  exit 0
fi

ts="$(date -u '+%Y%m%dT%H%M%SZ')"
key="${PREFIX}${NAME}_${ts}.sql.gz"
target="s3://${BACKUP_S3_BUCKET}/${key}"

# Argumentele de conexiune: DATABASE_URL dacă există; altfel PG_DUMP_CMD își
# ia singur conexiunea (ex. în container, cu POSTGRES_USER/POSTGRES_DB).
dump_args=(--no-owner --no-privileges --format=plain)
if [ -n "${DATABASE_URL:-}" ]; then
  dump_args+=(--dbname="$DATABASE_URL")
fi

if [ "$DRY_RUN" = 1 ]; then
  log "dry-run: ${PG_DUMP_CMD} ${dump_args[*]/--dbname=*/--dbname=***} | gzip -9 | aws s3 cp - ${target}"
else
  log "backup start → ${target}"
  # shellcheck disable=SC2086  # PG_DUMP_CMD poate conține mai multe cuvinte (docker exec …)
  $PG_DUMP_CMD "${dump_args[@]}" | gzip -9 | s3 s3 cp - "$target" --only-show-errors
  size="$(s3 s3api head-object --bucket "$BACKUP_S3_BUCKET" --key "$key" --query ContentLength --output text)"
  [ "${size:-0}" -gt 100 ] 2>/dev/null || fail "obiectul încărcat e gol sau lipsește (${size:-?} bytes)"
  log "backup ok ${target} (${size} bytes)"
fi

if [ "$RETENTION_DAYS" -gt 0 ]; then
  cutoff="$(date -u -d "-${RETENTION_DAYS} days" '+%Y-%m-%dT%H:%M:%SZ')"
  old_keys="$(s3 s3api list-objects-v2 --bucket "$BACKUP_S3_BUCKET" --prefix "${PREFIX}${NAME}_" \
    --query "Contents[?LastModified<'${cutoff}'].Key" --output text)"
  for old in $old_keys; do
    [ "$old" = "None" ] && continue
    if [ "$DRY_RUN" = 1 ]; then
      log "dry-run: ar șterge s3://${BACKUP_S3_BUCKET}/${old} (mai vechi de ${RETENTION_DAYS} zile)"
    else
      s3 s3 rm "s3://${BACKUP_S3_BUCKET}/${old}" --only-show-errors
      log "retenție: șters ${old}"
    fi
  done
fi
