#!/usr/bin/env bash
P="docker exec multi-erp-postgres psql -U multi -d multi_erp"
$P -c "SELECT indexname, indexdef FROM pg_indexes WHERE tablename='products'"
