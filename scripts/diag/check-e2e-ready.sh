#!/bin/bash
# Pre-verificare pentru testul E2E de maine: userul poate mina si retrage?
Q() { docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -t -A -F'|' -c "$1" 2>&1; }

echo "=== USERI (cine poate testa) ==="
Q "select id, email, created_at::date from users order by created_at limit 10;"

echo "=== SESIUNI MINING EXISTENTE ==="
Q "select user_id, started_at, claimed_at from swyp_mining_sessions order by started_at desc limit 5;"

echo "=== EMISSION RULE mining_daily activa? ==="
Q "select * from swyp_emission_rules where action='mining_daily';"

echo "=== RATE SWYP curent (trebuie sa raspunda) ==="
curl -s -m 8 https://swypik.com/api/swyp/rate
echo ""

echo "=== TREZORERIE REWARDS on-chain are fonduri? ==="
curl -s -m 8 -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["0x8d81D0852Fe4Fac9f1Da3977016f73CD304A2971","latest"],"id":1}' \
  http://172.17.0.1:8545 | python3 -c 'import sys,json;h=json.load(sys.stdin)["result"];print(f"{int(h,16)/10**18:,.0f} SWYP")'
