-- Add FK marketplace_products.taxonomy_node_slug -> taxonomy_nodes.slug
-- Verified 0 orphans before creating constraint.
ALTER TABLE marketplace_products
  ADD CONSTRAINT marketplace_products_taxonomy_node_slug_fkey
  FOREIGN KEY (taxonomy_node_slug) REFERENCES taxonomy_nodes(slug)
  ON UPDATE CASCADE ON DELETE SET NULL
  NOT VALID;
ALTER TABLE marketplace_products VALIDATE CONSTRAINT marketplace_products_taxonomy_node_slug_fkey;
CREATE INDEX IF NOT EXISTS idx_marketplace_products_taxonomy_slug ON marketplace_products(taxonomy_node_slug);
