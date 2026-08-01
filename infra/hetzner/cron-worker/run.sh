#!/bin/sh
# Swypik cron-worker
#   - Wakes every 60s, fires due jobs based on epoch modulo windows.
#   - Captures HTTP status; logs body on non-2xx so failures are visible
#     in `docker logs cron-worker`.
#   - Writes a heartbeat file every iteration and a per-job last-success
#     timestamp; container healthcheck asserts the loop is alive.
#   - Intentionally NOT using `set -e`: one failing job must not kill
#     the worker — the next iteration must still run other jobs.
set -u

echo "🕐 Swypik cron-worker started (pid=$$)"

HEARTBEAT=/tmp/cron-heartbeat
LASTOK_PREFIX=/tmp/cron-last-success
WEB=http://web-next:3000

run_job() {
  job="$1"
  method="$2"
  url="${WEB}/api/cron/${job}"
  ts=$(date -Iseconds)
  echo "[cron] ${ts} → ${job} (${method})"

  # Capture body separately, status from -w. -sS keeps it quiet but shows
  # transport-level errors on stderr. No `|| true` — we branch on code.
  http_code=$(curl -sS -m 300 -o /tmp/cron.out -w '%{http_code}' \
    -X "${method}" \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    "${url}" 2>/tmp/cron.err)
  curl_rc=$?

  if [ "${curl_rc}" -ne 0 ]; then
    echo "[cron] ${job} TRANSPORT_FAIL rc=${curl_rc} err=$(head -c 300 /tmp/cron.err 2>/dev/null)"
    return 1
  fi

  case "${http_code}" in
    2*)
      echo "[cron] ${job} OK status=${http_code}"
      date +%s > "${LASTOK_PREFIX}.${job}"
      return 0
      ;;
    *)
      echo "[cron] ${job} FAIL status=${http_code} body=$(head -c 500 /tmp/cron.out 2>/dev/null | tr -d '\n')"
      return 1
      ;;
  esac
}

while true; do
  TICK=$(date +%s)
  echo "${TICK}" > "${HEARTBEAT}"

  # Every 5 min
  if [ $((TICK % 300)) -lt 60 ]; then
    run_job publish-scheduled POST
    run_job refresh-rank POST
    # Dispecerizarea curselor Go / livrarilor Food — fara asta comenzile
    # raman neatribuite. (Adaugat 2026-07-31: ruta exista dar nu era programata.)
    run_job dispatch-tick POST
    # Deposit watcher: crediteaza depozitele on-chain (chain -> app).
    run_job scan-chain-deposits POST
  fi
  # Every 10 min
  if [ $((TICK % 600)) -lt 60 ]; then
    run_job watchdog-videos POST
      # Plasa de siguranta Go: anuleaza cursele blocate in requested/searching
      # daca dispatch-worker a murit. (Audit 2026-08-01.)
      run_job watchdog-rides POST
  fi
  # Every 15 min
  if [ $((TICK % 900)) -lt 60 ]; then
    run_job embed-batch POST
    run_job classify-pending POST
  fi
  # Every 30 min
  if [ $((TICK % 1800)) -lt 60 ]; then
    run_job process-payouts POST
  fi
  # Every hour
  if [ $((TICK % 3600)) -lt 60 ]; then
    run_job swyp-view-milestones GET
    run_job refresh-fx GET
    # Alerte operationale + agregari (adaugate 2026-07-31)
    run_job alert-video-queue GET
    run_job aggregate-video-stats POST
    run_job fly-price-watch GET
    # Integritatea economiei SWYP: invariant supply + hash-chain ledger (2026-08-01)
    run_job verify-supply POST
  fi
  # Every 4 hours
  if [ $((TICK % 14400)) -lt 60 ]; then
    run_job abandoned-cart POST
  fi
  # Weekly Monday 09:00 — email digest
  DOW=$(date -u +%u); HOUR=$(date -u +%H); MIN=$(date -u +%M)
  if [ "${DOW}" = "1" ] && [ "${HOUR}" = "09" ] && [ "${MIN}" -lt 2 ]; then
    run_job email-digest POST
  fi

  # Once per day
  if [ $((TICK % 86400)) -lt 60 ]; then
    run_job suspend-unverified GET
    run_job strikes-decay POST
    run_job cleanup-tokens GET
    # Adaugate 2026-07-31 (rute existente, neprogramate)
    run_job alert-dispute-deadlines GET
    run_job reconcile-wallets POST
    run_job indexnow GET
    run_job bing-url-submit GET
  fi

  sleep 60
done
