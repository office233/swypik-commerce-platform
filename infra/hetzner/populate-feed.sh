#!/bin/bash
COMPOSE="/opt/swypik/app/infra/hetzner/docker-compose.prod.yml"

echo "=== Populating videos table from ae_products ==="

docker compose -f $COMPOSE exec -T postgres psql -U swypik -d swypik <<'SQL'

-- Create a system creator for AliExpress imported clips
INSERT INTO users (id, username, email, display_name, avatar_url, role, status, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'swypik_official',
  'system@swypik.com',
  'Swypik',
  'https://swypik.com/favicon.ico',
  'shopper',
  'active',
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Insert videos from ae_products that have video_url
INSERT INTO videos (
  id, creator_id, slug, title, description,
  thumbnail_url, playback_url,
  width, height,
  visibility, status, language_code,
  product_refs, tags,
  view_count, like_count, comment_count, save_count, share_count,
  published_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'ae-' || ap.ae_product_id,
  COALESCE(ap.title_ro, ap.title, 'Product Video'),
  COALESCE(ap.title_ro, ap.title, ''),
  ap.video_poster,
  ap.video_url,
  1080, 1920,
  'public', 'ready', 'ro',
  CASE 
    WHEN mp.id IS NOT NULL 
    THEN jsonb_build_array(jsonb_build_object('product_id', mp.id::text, 'ae_product_id', ap.ae_product_id))
    ELSE jsonb_build_array(jsonb_build_object('ae_product_id', ap.ae_product_id))
  END,
  ARRAY[COALESCE(ap.product_type, 'uncategorized')],
  floor(random() * 500 + 50)::bigint,
  floor(random() * 100 + 5)::bigint,
  floor(random() * 20)::bigint,
  floor(random() * 30)::bigint,
  floor(random() * 40)::bigint,
  NOW() - (random() * interval '30 days'),
  NOW(), NOW()
FROM ae_products ap
LEFT JOIN marketplace_products mp ON mp.external_product_id = ap.ae_product_id::text
WHERE ap.video_url IS NOT NULL 
  AND ap.video_url != ''
  AND ap.has_video = true;

SELECT COUNT(*) as total_feed_videos FROM videos WHERE status = 'ready';
SQL

echo "=== DONE ==="
