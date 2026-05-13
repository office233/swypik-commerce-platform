UPDATE videos v
SET product_refs = jsonb_build_array(
  jsonb_build_object(
    'product_id', mp.id::text,
    'ae_product_id', (v.product_refs->0->>'ae_product_id')
  )
)
FROM marketplace_products mp
WHERE mp.external_product_id = (v.product_refs->0->>'ae_product_id')
  AND v.product_refs IS NOT NULL
  AND jsonb_array_length(v.product_refs) > 0;
