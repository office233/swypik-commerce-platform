#!/bin/sh
set -eu
echo "🕐 Swypik cron-worker started"
while true; do
  TICK=$(date +%s)
  if [ $((TICK % 900)) -lt 60 ]; then
    echo "[cron] $(date -Iseconds) → process-dropship"
    curl -sf -X POST -H "Authorization: Bearer ${CRON_SECRET}" http://web-next:3000/api/cron/process-dropship || true
  fi
  if [ $((TICK % 1800)) -lt 60 ]; then
    echo "[cron] $(date -Iseconds) → process-payouts"
    curl -sf -X POST -H "Authorization: Bearer ${CRON_SECRET}" http://web-next:3000/api/cron/process-payouts || true
  fi
  if [ $((TICK % 14400)) -lt 60 ]; then
    echo "[cron] $(date -Iseconds) → abandoned-cart"
    curl -sf -X POST -H "Authorization: Bearer ${CRON_SECRET}" http://web-next:3000/api/cron/abandoned-cart || true
  fi
  if [ $((TICK % 3600)) -lt 60 ]; then
    echo "[cron] $(date -Iseconds) → sync-dropship-status"
    curl -sf -X POST -H "Authorization: Bearer ${CRON_SECRET}" http://web-next:3000/api/cron/sync-dropship-status || true
  fi
  if [ $((TICK % 86400)) -lt 60 ]; then
    echo "[cron] $(date -Iseconds) → suspend-unverified"
    curl -sf -X POST -H "Authorization: Bearer ${CRON_SECRET}" http://web-next:3000/api/cron/suspend-unverified || true
  fi
  sleep 60
done
