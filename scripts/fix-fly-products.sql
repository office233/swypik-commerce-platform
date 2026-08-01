-- Completează produsele fly ca să treacă filtrele feedului:
-- taxonomy_node_slug='flights', effective_label='safe'.
UPDATE marketplace_products
SET taxonomy_node_slug = 'flights',
    effective_label = 'safe',
    updated_at = NOW()
WHERE metadata->>'vertical' = 'fly';

SELECT title, taxonomy_node_slug, effective_label, status, price_cents FROM marketplace_products WHERE metadata->>'vertical'='fly';
