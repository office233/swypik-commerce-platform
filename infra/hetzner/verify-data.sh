#!/bin/bash
COMPOSE="/opt/swypik/app/infra/hetzner/docker-compose.prod.yml"

echo "=== ae_products ==="
docker compose -f $COMPOSE exec -T postgres psql -U swypik -d swypik -c "SELECT COUNT(*) FROM ae_products;"

echo "=== ae_products with video ==="
docker compose -f $COMPOSE exec -T postgres psql -U swypik -d swypik -c "SELECT COUNT(*) FROM ae_products WHERE video_url IS NOT NULL AND video_url != '';"

echo "=== ae_variants ==="
docker compose -f $COMPOSE exec -T postgres psql -U swypik -d swypik -c "SELECT COUNT(*) FROM ae_variants;"

echo "=== ae_categories ==="
docker compose -f $COMPOSE exec -T postgres psql -U swypik -d swypik -c "SELECT COUNT(*) FROM ae_categories;"

echo "=== TOTAL DATA ON PRODUCTION ==="
docker compose -f $COMPOSE exec -T postgres psql -U swypik -d swypik -c "SELECT 'marketplace_products' as tbl, COUNT(*) FROM marketplace_products UNION ALL SELECT 'marketplace_variants', COUNT(*) FROM marketplace_product_variants UNION ALL SELECT 'ae_products', COUNT(*) FROM ae_products UNION ALL SELECT 'ae_variants', COUNT(*) FROM ae_variants UNION ALL SELECT 'ae_categories', COUNT(*) FROM ae_categories;"
