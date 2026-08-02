#!/bin/bash
# Verifica paginile /admin/* cu sesiune admin (nu afiseaza secretul).
set -e
PASS=$(grep -E '^ADMIN_(PASSWORD|SECRET)=' /opt/swypik/app/infra/hetzner/.env.production | head -1 | cut -d= -f2-)
if [ -z "$PASS" ]; then echo "NO_ADMIN_SECRET_IN_ENV"; exit 1; fi
JAR=$(mktemp)
# login: incearca /api/admin/login apoi /api/auth admin
code=$(curl -s -o /tmp/adminlogin.out -w '%{http_code}' -c "$JAR" -X POST https://swypik.com/api/admin/login -H 'Content-Type: application/json' -d "{\"password\":\"$PASS\"}")
echo "login=$code"
for p in /admin/health /admin/users /admin/applications /admin/refunds /admin/commissions /admin/creators /admin/pricing /admin/strikes /admin/fleet /admin/risk /admin/hosts /admin/reviews; do
  c=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" "https://swypik.com$p")
  echo "$p=$c"
done
rm -f "$JAR" /tmp/adminlogin.out
