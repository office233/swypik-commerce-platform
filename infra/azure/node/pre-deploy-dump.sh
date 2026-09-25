#!/usr/bin/env bash
# Rulat PE nodul data înainte de migrări. Dacă există infra/azure/backup-db.sh
# (backup complet + copie off-site) îl folosește; altfel face un pg_dump local.
# Argumente: RELEASE_DIR [multi-erp]
set -euo pipefail

rel=$1; what=${2:-swypik}
dir=/srv/data/backups
stamp=$(date +%Y%m%d-%H%M)

dump() { # CONTAINER FIȘIER
  local c=$1 f=$2
  docker exec "$c" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' \
    | gzip -1 > "$f.tmp"
  gzip -t "$f.tmp"
  test -s "$f.tmp"
  mv "$f.tmp" "$f"
  chmod 600 "$f"
  ls -lh "$f"
}

if [ "$what" = multi-erp ]; then
  mkdir -p "$dir/multi-erp"
  dump multi-erp-postgres "$dir/multi-erp/pre-deploy-$stamp.sql.gz"
  exit 0
fi

if [ -f "$rel/infra/azure/backup-db.sh" ]; then
  # Containerul Postgres pe nodul data e `swypik-postgres` (compose/data.yml).
  POSTGRES_CONTAINER=swypik-postgres BACKUP_REASON=pre-deploy bash "$rel/infra/azure/backup-db.sh"
else
  mkdir -p "$dir/postgres"
  dump swypik-postgres "$dir/postgres/pre-deploy-$stamp.sql.gz"
fi
# Păstrează ultimele 10 dump-uri pre-deploy locale (backup-ul zilnic are retenția lui).
find "$dir/postgres" -maxdepth 1 -name 'pre-deploy-*.sql.gz' -printf '%T@ %p\n' 2>/dev/null \
  | sort -rn | tail -n +11 | cut -d' ' -f2- | xargs -r rm -f
