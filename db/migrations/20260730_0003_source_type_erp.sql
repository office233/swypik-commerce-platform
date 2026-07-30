-- Permite source_type = 'meister_erp' pentru produsele sincronizate din ERP.
ALTER TABLE marketplace_products DROP CONSTRAINT IF EXISTS marketplace_products_source_type_check;
ALTER TABLE marketplace_products ADD CONSTRAINT marketplace_products_source_type_check
  CHECK (source_type = ANY (ARRAY['seller', 'aliexpress', 'affiliate', 'manual', 'other', 'meister_erp']));
