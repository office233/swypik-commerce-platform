#!/bin/bash
set -e
cd /opt/swypik/app
set -a
. infra/hetzner/.env.production
set +a
export DATABASE_URL=$(echo "$DATABASE_URL" | sed 's|@postgres:|@127.0.0.1:|')
exec node scripts/seed-taxonomy-i18n.mjs >> /opt/swypik/logs/reclassify-taxonomy.log 2>&1
