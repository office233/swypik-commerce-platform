#!/bin/bash
docker compose -f /opt/swypik/app/infra/hetzner/docker-compose.prod.yml exec -T postgres psql -U swypik -d swypik -t -A -c "SELECT id FROM marketplace_products WHERE status='active' AND price_cents > 0 LIMIT 1;"
