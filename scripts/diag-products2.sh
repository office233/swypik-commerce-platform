#!/bin/bash
git -C /opt/swypik/app log --oneline -3
echo "=== singurul produs ==="
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tAc "SELECT id, title, source_type, status FROM marketplace_products LIMIT 3"
echo "=== cate erau ieri? (comenzi ca referinta) ==="
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tAc "SELECT count(*) FROM orders"
echo "=== tabele ae_ ==="
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tAc "SELECT tablename FROM pg_tables WHERE tablename LIKE 'ae_%'"
echo "=== s-a rulat vreo stergere azi? cautam in istoricul psql/al scripturilor ==="
grep -rn "DELETE FROM marketplace_products\|TRUNCATE.*marketplace" /opt/swypik/app/scripts/*.sh /opt/swypik/app/scripts/*.sql /tmp/*.sh 2>/dev/null | head -5
echo "=== API produse ==="
curl -s 'https://swypik.com/api/products?limit=3' | head -c 300
