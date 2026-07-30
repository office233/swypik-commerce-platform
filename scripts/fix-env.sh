#!/usr/bin/env bash
# Fix: EMAIL_FROM continea < > neghilimelate — sparge source-ul env-ului in deploy.sh.
set -euo pipefail
ENVF=/opt/swypik/app/infra/hetzner/.env.production
cp "$ENVF" /opt/meister-backups/env.production.bak.20260730
sed -i 's|^EMAIL_FROM=Swypik <noreply@swypik.com>$|EMAIL_FROM="Swypik <noreply@swypik.com>"|' "$ENVF"
grep -n '^EMAIL_FROM' "$ENVF"
