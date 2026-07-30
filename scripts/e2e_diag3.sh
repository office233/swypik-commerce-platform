#!/usr/bin/env bash
P="docker exec multi-erp-postgres psql -U multi -d multi_erp"
echo "--- constraint def ---"
$P -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='products'::regclass"
echo "--- produse existente cu cod E2E ---"
$P -c "SELECT id,tenant_id,denumire,cod_bare FROM products WHERE cod_bare LIKE 'E2E%' OR denumire LIKE '%E2E%'"
echo "--- products has tenant_id? ---"
$P -c "SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name IN ('tenant_id','cod_bare','msin')"
