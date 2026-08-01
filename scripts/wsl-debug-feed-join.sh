#!/bin/bash
# Debug: de ce clipurile oficiale nu au product în feed.
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -c "
SELECT v.title, v.product_refs->0->>'product_id' AS ref, mp.id IS NOT NULL AS mp_found, mp.status, mp.seller_id
FROM videos v
LEFT JOIN marketplace_products mp ON mp.id::text = v.product_refs->0->>'product_id'
WHERE v.creator_id = '00000000-0000-4000-9000-0000000f1c1a'
ORDER BY v.created_at LIMIT 8;"
echo "=== oficialele apar in feed API? ==="
curl -s 'http://127.0.0.1:3005/api/explore/feed?limit=30' | python3 -c "
import json, sys
d = json.load(sys.stdin)
for v in d.get('videos', []):
    if v['creator'].get('username') == 'swypik':
        p = v.get('product') or {}
    print((v.get('title') or v.get('caption') or '')[:34], '|', p.get('title', 'FARA PRODUS'), '|', p.get('priceDisplay',''))
print('total videos in feed:', len(d.get('videos', [])))"
