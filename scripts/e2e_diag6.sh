#!/usr/bin/env bash
P="docker exec multi-erp-postgres psql -U multi -d multi_erp"
$P -c "SELECT product_id,status,external_id,last_error FROM product_publications ORDER BY product_id DESC LIMIT 5"
$P -c "SELECT id,tenant_id FROM products WHERE id=4"
$P -c "SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name='image_url'"
