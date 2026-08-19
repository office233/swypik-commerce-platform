#!/usr/bin/env bash
# Health watchdog: dacă lanțul nu mai avansează (validator blocat/mort),
# repornește containerul validator. Complementar watchdog-ului de peering.
# Cron la 5 minute. Idempotent; loghează doar când intervine.
set -uo pipefail

VAL=swypik-chain
STATE=/var/run/swypik-chain-last-block
LOG=/var/log/swypik-chain-health.log

block=$(docker exec "$VAL" geth attach --exec "eth.blockNumber" /data/geth.ipc 2>/dev/null | tr -dc '0-9')

if [ -z "$block" ]; then
  # geth nu răspunde deloc → restart
  echo "$(date '+%F %T') geth nu raspunde -> restart" >> "$LOG"
  docker restart "$VAL" >/dev/null 2>&1
  rm -f "$STATE"
  exit 0
fi

last=$(cat "$STATE" 2>/dev/null || echo "")
echo "$block" > "$STATE"

# Prima rulare sau progres normal → nimic de făcut
[ -z "$last" ] && exit 0
[ "$block" -gt "$last" ] && exit 0

# Blocul nu a avansat în 5 minute (ar fi trebuit ~60 blocuri la 5s/bloc)
echo "$(date '+%F %T') lant inghetat la blocul $block -> restart validator" >> "$LOG"
docker restart "$VAL" >/dev/null 2>&1
rm -f "$STATE"
