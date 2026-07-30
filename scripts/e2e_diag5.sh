#!/usr/bin/env bash
docker logs multi-erp-backend --tail 60 2>&1 | grep -viE 'ProbeCron' | grep -iE 'swypik|publish|push|error|warn' | tail -15
P="docker exec multi-erp-postgres psql -U multi -d multi_erp"
$P -c "SELECT tenant_id,provider,status,config FROM tenant_integrations WHERE provider='swypik'"
$P -c "SELECT product_id,status,last_error FROM swypik_published_products ORDER BY product_id DESC LIMIT 5" 2>/dev/null || $P -c "\dt" | grep -i swypik
