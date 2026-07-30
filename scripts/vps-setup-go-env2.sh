#!/bin/bash
set -e
cd /opt/swypik/app/infra/hetzner
echo "== files =="
ls
ENVF=$(ls .env .env.production 2>/dev/null | head -1)
[ -z "$ENVF" ] && ENVF=$(grep -l 'CRON_SECRET' .env* 2>/dev/null | head -1)
echo "env file: $ENVF"
if [ -z "$ENVF" ]; then echo "NO ENV FILE FOUND"; grep -n 'env_file' docker-compose*.yml | head; exit 1; fi
if ! grep -q '^VAPID_PUBLIC_KEY=' "$ENVF"; then
  cat >> "$ENVF" <<'EOF'

# --- Mobility (Go/Eats) push — 2026-07-30 ---
VAPID_PUBLIC_KEY=BFijwCq5sjHLoLWeZhE-TAnq7Dk6Xdz4cTRYSMPH0LU_9W2oH2SbX8uXaVniWaRz5vbeq41vlbcNTms82Aa_OSM
VAPID_PRIVATE_KEY=y0KFyWTDHv6T-Rln9Zc-nw_vAuJGFEqBdodZCmtlPyU
VAPID_SUBJECT=mailto:support@swypik.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BFijwCq5sjHLoLWeZhE-TAnq7Dk6Xdz4cTRYSMPH0LU_9W2oH2SbX8uXaVniWaRz5vbeq41vlbcNTms82Aa_OSM
EOF
  echo "VAPID added"
else
  echo "VAPID already present"
fi
CRON_SECRET_VAL=$(grep '^CRON_SECRET=' "$ENVF" | cut -d= -f2)
echo "CRON_SECRET present: $([ -n "$CRON_SECRET_VAL" ] && echo yes || echo NO)"
# cron dispatch-tick la 10s (6 sub-apeluri per minut)
CRONLINE="* * * * * for i in 0 1 2 3 4 5; do (sleep \$((i*10)); curl -s -o /dev/null -H \"x-cron-secret: $CRON_SECRET_VAL\" https://swypik.com/api/cron/dispatch-tick) & done # dispatch-tick"
( crontab -l 2>/dev/null | grep -v dispatch-tick; echo "$CRONLINE" ) | crontab -
echo "cron OK: $(crontab -l | grep -c dispatch-tick) line(s)"
