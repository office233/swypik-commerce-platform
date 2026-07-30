#!/bin/bash
set -e
ENVF=/opt/swypik/app/infra/hetzner/.env.production
add_if_missing() {
  local key="$1" val="$2" note="$3"
  if grep -q "^${key}=" "$ENVF"; then
    echo "  $key: already set"
  else
    echo "${key}=${val}" >> "$ENVF"
    echo "  $key: ADDED ($note)"
  fi
}
echo "== completare secrete lipsa =="
add_if_missing APP_ENCRYPTION_KEY "$(openssl rand -hex 32)" "generat"
add_if_missing FEED_EVENT_IP_SALT "$(openssl rand -hex 16)" "generat"
add_if_missing PAYOUT_MIN_CENTS "5000" "prag retragere 50 RON"
add_if_missing CREATOR_COMMISSION_BPS "500" "5%"
add_if_missing DEFAULT_TIMEZONE "Europe/Bucharest" "default"
add_if_missing OSRM_URL "https://router.project-osrm.org" "rutare"
echo
echo "== verificare (prefixe) =="
grep -E '^(APP_ENCRYPTION_KEY|FEED_EVENT_IP_SALT|VAPID_PUBLIC_KEY|CRON_SECRET|PAYOUT_MIN_CENTS|OSRM_URL)=' "$ENVF" | sed 's/\(=.\{0,8\}\).*/\1.../'
