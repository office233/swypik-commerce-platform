#!/bin/bash
set -e
cd /opt/swypik/app
ENVF=$(ls .env.production .env.local .env 2>/dev/null | head -1)
echo "env file: $ENVF"
if ! grep -q VAPID_PUBLIC_KEY "$ENVF"; then
  CRON=$(openssl rand -hex 24)
  cat >> "$ENVF" <<EOF

# --- Mobility (Go/Eats) — adăugat 2026-07-30 ---
VAPID_PUBLIC_KEY=BFijwCq5sjHLoLWeZhE-TAnq7Dk6Xdz4cTRYSMPH0LU_9W2oH2SbX8uXaVniWaRz5vbeq41vlbcNTms82Aa_OSM
VAPID_PRIVATE_KEY=y0KFyWTDHv6T-Rln9Zc-nw_vAuJGFEqBdodZCmtlPyU
VAPID_SUBJECT=mailto:support@swypik.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BFijwCq5sjHLoLWeZhE-TAnq7Dk6Xdz4cTRYSMPH0LU_9W2oH2SbX8uXaVniWaRz5vbeq41vlbcNTms82Aa_OSM
CRON_SECRET=$CRON
EOF
  echo "added VAPID + CRON_SECRET"
fi
CRON_SECRET_VAL=$(grep '^CRON_SECRET=' "$ENVF" | cut -d= -f2)
# cron: dispatch tick la fiecare minut cu 6 apeluri la 10s (cron nu suportă sub-minut)
CRONLINE="* * * * * for i in 0 1 2 3 4 5; do (sleep \$((i*10)); curl -s -o /dev/null -H \"x-cron-secret: $CRON_SECRET_VAL\" https://swypik.com/api/cron/dispatch-tick) & done"
( crontab -l 2>/dev/null | grep -v dispatch-tick; echo "$CRONLINE" ) | crontab -
echo "cron installed:"
crontab -l | grep dispatch-tick | head -1
