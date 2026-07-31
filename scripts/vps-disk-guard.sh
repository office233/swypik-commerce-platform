#!/usr/bin/env bash
# Disk guard: curățenie automată + alarmă la umplere.
# Instalat în cron (vezi crontab): săptămânal prune, zilnic verificare prag.
set -u

MODE="${1:-check}"
THRESHOLD=80
LOG=/var/log/disk-guard.log

log() { echo "$(date '+%F %T') $*" >> "$LOG"; }

case "$MODE" in
  prune)
    # Săptămânal: șterge gunoiul Docker care se acumulează la rebuild-uri.
    BEFORE=$(df --output=pcent / | tail -1 | tr -dc '0-9')
    docker image prune -af --filter "until=72h" >/dev/null 2>&1
    docker builder prune -af --keep-storage=5GB >/dev/null 2>&1
    journalctl --vacuum-size=300M >/dev/null 2>&1
    apt-get clean >/dev/null 2>&1
    AFTER=$(df --output=pcent / | tail -1 | tr -dc '0-9')
    log "prune: ${BEFORE}% -> ${AFTER}%"
    ;;
  check)
    # Zilnic: dacă discul trece de prag, alertează + prune de urgență.
    USED=$(df --output=pcent / | tail -1 | tr -dc '0-9')
    if [ "$USED" -ge "$THRESHOLD" ]; then
      log "ALERT: disk ${USED}% >= ${THRESHOLD}% — emergency prune"
      docker builder prune -af >/dev/null 2>&1
      docker image prune -af >/dev/null 2>&1
      USED2=$(df --output=pcent / | tail -1 | tr -dc '0-9')
      log "after emergency prune: ${USED2}%"
      # Alertă pe healthcheck-ul aplicației (apare în loguri/Grafana) +
      # e-mail dacă e configurat un MTA local.
      echo "VPS disk usage ${USED2}% (was ${USED}%) after emergency prune on $(hostname)" \
        | mail -s "DISK ALERT swypik VPS" "${ALERT_EMAIL:-root}" 2>/dev/null || true
    else
      log "ok: disk ${USED}%"
    fi
    ;;
  *)
    echo "usage: $0 {prune|check}"; exit 1;;
esac
