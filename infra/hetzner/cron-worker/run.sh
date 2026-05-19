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
  fi
  # Every 10 min
  if [ $((TICK % 600)) -lt 60 ]; then
    run_job watchdog-videos POST
  fi
  # Every 15 min
  if [ $((TICK % 900)) -lt 60 ]; then
    run_job process-dropship POST
    run_job embed-batch POST
    run_job classify-pending POST
  fi
  # Every 30 min
  if [ $((TICK % 1800)) -lt 60 ]; then
    run_job process-payouts POST
  fi
  # Every hour
  if [ $((TICK % 3600)) -lt 60 ]; then
    run_job sync-dropship-status POST
    run_job swyp-view-milestones GET
    run_job refresh-fx GET
  fi
  # Every 4 hours
  if [ $((TICK % 14400)) -lt 60 ]; then
    run_job abandoned-cart POST
  fi
  # Every 6 hours (AI trend detection)
  if [ $((TICK % 21600)) -lt 60 ]; then
    run_job detect-trends POST
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
  fi

  sleep 60
done
