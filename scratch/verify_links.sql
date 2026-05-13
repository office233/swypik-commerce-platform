SELECT v.id as video_id, v.product_refs->0->>'product_id' as product_id, v.product_refs->0->>'ae_product_id' as ae_id
FROM videos v
WHERE v.product_refs IS NOT NULL AND jsonb_array_length(v.product_refs) > 0
LIMIT 5;
