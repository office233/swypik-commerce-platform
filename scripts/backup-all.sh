#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# Backup complet VPS → local + offsite (Hetzner Storage Box prin SSH/rsync)
# ═══════════════════════════════════════════════════════════════════════
# Salvează TOATE bazele de date (Swypik, Meister ERP, multi-ERP) + fișiere
# de configurare, apoi sincronizează offsite. Local păstrează 7 zile,
# offsite 90 de zile.
#
# Instalare: /usr/local/bin/backup-all.sh, cron zilnic 03:30
# Config: /etc/swypik-backup.env  (STORAGE_BOX_USER, STORAGE_BOX_HOST)
set -uo pipefail

CONF=/etc/swypik-backup.env
[ -f "$CONF" ] && . "$CONF"

BACKUP_ROOT="${BACKUP_ROOT:-/opt/backups}"
KEEP_LOCAL_DAYS="${KEEP_LOCAL_DAYS:-7}"
SB_USER="${STORAGE_BOX_USER:-}"
SB_HOST="${STORAGE_BOX_HOST:-}"
SB_PORT="${STORAGE_BOX_PORT:-23}"
SSH_KEY="${SSH_KEY:-/root/.ssh/storagebox_ed25519}"
LOG=/var/log/backup-all.log
TS=$(date +%Y%m%d_%H%M)
DAY_DIR="$BACKUP_ROOT/$(date +%Y-%m-%d)"

log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }
mkdir -p "$DAY_DIR"

fail=0

# ── 1. Baze de date ────────────────────────────────────────────────────
# format: container|user|db|nume_fisier
DBS=(
  "swypik-prod-postgres-1|swypik|swypik_prod|swypik_prod"
  "meister-postgres|meister|meister_erp|meister_erp"
  "multi-erp-postgres|multi|multi_erp|multi_erp"
)

for entry in "${DBS[@]}"; do
  IFS='|' read -r container user db name <<< "$entry"
  if ! docker ps --format '{{.Names}}' | grep -qx "$container"; then
    log "SKIP $name — container $container nu ruleaza"; continue
  fi
  out="$DAY_DIR/${name}_${TS}.dump"
  if docker exec "$container" pg_dump -U "$user" -d "$db" -Fc 2>>"$LOG" > "$out"; then
    size=$(du -h "$out" | cut -f1)
    # dump gol/corupt = eșec
    if [ ! -s "$out" ]; then log "FAIL $name — dump gol"; rm -f "$out"; fail=1
    else log "OK   $name ($size)"; fi
  else
    log "FAIL $name — pg_dump a esuat"; rm -f "$out"; fail=1
  fi
done

# globals (roluri/parole) — necesare la restaurare completă
docker exec swypik-prod-postgres-1 pg_dumpall -U swypik --globals-only 2>/dev/null \
  | gzip > "$DAY_DIR/swypik_globals_${TS}.sql.gz" || true

# ── 2. Configurări critice (fără secrete în clar în offsite? le includem,
#      Storage Box e privat și accesat doar cu cheie) ────────────────────
tar czf "$DAY_DIR/config_${TS}.tar.gz" \
  /opt/swypik/app/infra/hetzner/.env.production \
  /etc/nginx 2>/dev/null || true

# ── 3. Retenție locală ─────────────────────────────────────────────────
find "$BACKUP_ROOT" -maxdepth 1 -type d -name '20*' -mtime +"$KEEP_LOCAL_DAYS" -exec rm -rf {} + 2>/dev/null

# ── 4. Offsite: Hetzner Storage Box ────────────────────────────────────
if [ -n "$SB_USER" ] && [ -n "$SB_HOST" ] && [ -f "$SSH_KEY" ]; then
  if rsync -az --delete-after \
      -e "ssh -p $SB_PORT -i $SSH_KEY -o StrictHostKeyChecking=accept-new" \
      "$BACKUP_ROOT/" "${SB_USER}@${SB_HOST}:./backups/" >>"$LOG" 2>&1; then
    log "OK   offsite sync → ${SB_HOST}"
    # Retenție offsite: șterge directoarele mai vechi de 90 de zile.
    CUTOFF=$(date -d '90 days ago' +%Y-%m-%d)
    ssh -p "$SB_PORT" -i "$SSH_KEY" "${SB_USER}@${SB_HOST}" \
      "for d in backups/20*; do [ \"\$(basename \$d)\" \\< \"$CUTOFF\" ] && rm -rf \$d; done" \
      >>"$LOG" 2>&1 || true
  else
    log "FAIL offsite sync"; fail=1
  fi
else
  log "SKIP offsite — Storage Box neconfigurat ($CONF)"
fi

TOTAL=$(du -sh "$DAY_DIR" 2>/dev/null | cut -f1)
log "=== backup $TS terminat: $TOTAL, disc $(df --output=pcent / | tail -1 | tr -d ' ') ==="
exit $fail
