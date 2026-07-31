#!/usr/bin/env bash
# Reset complet date de test pentru re-rulare E2E.
P="docker exec multi-erp-postgres psql -U multi -d multi_erp"
S="docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod"
$P -c "DELETE FROM tenant_users WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'e2e-test-%')"
$P -c "DELETE FROM users WHERE username LIKE 'e2e-test-%'"
$P -c "DELETE FROM products WHERE tenant_id IN (SELECT id FROM tenants WHERE slug LIKE 'test-business%')"
$P -c "DELETE FROM tenants WHERE slug LIKE 'test-business%'"
$P -c "SELECT setval('tenants_id_seq',(SELECT MAX(id) FROM tenants)); SELECT setval('users_id_seq',(SELECT MAX(id) FROM users))"
$S -c "DELETE FROM marketplace_products WHERE seller_id IN (SELECT id FROM sellers WHERE name='Test Business E2E SRL')"
$S -c "DELETE FROM sellers WHERE name='Test Business E2E SRL'"
echo RESET_DONE
