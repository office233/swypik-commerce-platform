#!/usr/bin/env bash
# Swypik blog automation pipeline
#   1. Evergreen seeds (RO) — repune articolele dacă lipsesc
#   2. Discover (RO) — 1 articol nou săptămânal pe categorie proaspătă
#   3. EN translator — generează traduceri EN pentru articolele fără traducere
set -euo pipefail
LOG_DIR=/var/log/swypik
LOG_FILE="$LOG_DIR/blog-auto-generate.log"
TS=$(date -Iseconds)
cd /opt/swypik/app
export DATABASE_URL='postgres://swypik_app:kPPOYib9D9Ls07gm81l3KkTBPOQ2xD9TBz2NbRHR@127.0.0.1:5432/swypik'

{
  echo ""
  echo "=========================================="
  echo "[$TS] BLOG AUTO-PIPELINE"
  echo "=========================================="

  echo ""
  echo "--- Step 1/4: evergreen RO seeds ---"
  /usr/bin/node scripts/blog-generate-articles.mjs --apply 2>&1 || echo "[$TS] WARN: evergreen failed"

  echo ""
  echo "--- Step 2/4: discover RO (1 new topic/day) ---"
  /usr/bin/node scripts/blog-discover-topics.mjs --apply --max=1 2>&1 || echo "[$TS] WARN: discover failed"

  echo ""
  echo "--- Step 3/4: EN translations ---"
  /usr/bin/node scripts/blog-translate-en.mjs --apply 2>&1 || echo "[$TS] WARN: EN translation failed"


  echo ""
  echo "--- Step 4/4: DE/ES/FR/PT/IT translations ---"
  # Copy script into web-next container (needs node_modules with pg)
  docker cp /opt/swypik/app/scripts/blog-translate.mjs swypik-prod-web-next-1:/app/blog-translate.mjs 2>/dev/null || true
  docker compose -f /opt/swypik/app/infra/hetzner/docker-compose.prod.yml exec -T web-next \
    node /app/blog-translate.mjs --apply 2>&1 || echo "[$TS] WARN: multi-locale translation failed"

  echo ""
  echo "[$TS] PIPELINE DONE"
} >> "$LOG_FILE" 2>&1
