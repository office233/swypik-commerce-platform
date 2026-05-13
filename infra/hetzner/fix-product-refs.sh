#!/bin/bash
COMPOSE="/opt/swypik/app/infra/hetzner/docker-compose.prod.yml"

echo "=== 1. Current product_refs state ==="
docker compose -f $COMPOSE exec -T postgres psql -U swypik -d swypik <<'SQL'
SELECT 'total_videos' AS metric, COUNT(*) FROM videos WHERE status='ready'
UNION ALL SELECT 'has_product_refs', COUNT(*) FROM videos WHERE product_refs IS NOT NULL AND product_refs != '[]'::jsonb
UNION ALL SELECT 'has_product_id', COUNT(*) FROM videos WHERE (product_refs->0->>'product_id') IS NOT NULL
ORDER BY 1;
SQL

echo ""
echo "=== 2. Linking videos to marketplace_products ==="
docker compose -f $COMPOSE exec -T postgres psql -U swypik -d swypik <<'SQL'
-- First, set product_refs for videos that have ae_product_id in their slug
-- The videos were created from ae_products, slug contains ae_product_id
UPDATE videos v
SET product_refs = jsonb_build_array(
  jsonb_build_object(
    'product_id', mp.id::text,
    'ae_product_id', mp.external_product_id
  )
)
FROM marketplace_products mp
WHERE mp.external_product_id = SPLIT_PART(v.slug, '-ae-', 2)
  AND SPLIT_PART(v.slug, '-ae-', 2) != ''
  AND (v.product_refs IS NULL OR v.product_refs = '[]'::jsonb OR (v.product_refs->0->>'product_id') IS NULL);
SQL

echo ""
echo "=== 3. Check result ==="
docker compose -f $COMPOSE exec -T postgres psql -U swypik -d swypik <<'SQL'
SELECT 'linked_videos' AS metric, COUNT(*) FROM videos WHERE (product_refs->0->>'product_id') IS NOT NULL;
SQL

echo ""
echo "=== 4. Sample linked video ==="
docker compose -f $COMPOSE exec -T postgres psql -U swypik -d swypik <<'SQL'
SELECT v.id, LEFT(v.title, 40) AS title, v.product_refs->0->>'product_id' AS product_id, mp.title AS product_title
FROM videos v
LEFT JOIN marketplace_products mp ON mp.id::text = (v.product_refs->0->>'product_id')
WHERE (v.product_refs->0->>'product_id') IS NOT NULL
LIMIT 3;
SQL

echo ""
echo "=== 5. Verify feed API returns product data ==="
sleep 2
curl -s "https://swypik.com/api/explore/feed?limit=2" 2>/dev/null | python3 -m json.tool 2>/dev/null | grep -A5 '"product"' | head -20

echo ""
echo "=== DONE ==="
