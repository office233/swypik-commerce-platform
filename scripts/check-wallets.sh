#!/bin/bash
Q() { docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -t -A -F'|' -c "$1" 2>&1; }
echo "=== PORTOFELE ON-CHAIN CREATE (swyp_chain_wallets) ==="
Q "select user_id, address, created_at, exported_at from swyp_chain_wallets order by created_at;"
echo "=== SCHEMA: cheia privata e criptata? ==="
Q "select column_name from information_schema.columns where table_name='swyp_chain_wallets' order by ordinal_position;"
echo "=== SOLD ON-CHAIN pt fiecare adresa ==="
for a in $(docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -t -A -c "select address from swyp_chain_wallets;" 2>/dev/null); do
  hex=$(curl -s -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["'$a'","latest"],"id":1}' http://172.17.0.1:8545 | python3 -c 'import sys,json;print(json.load(sys.stdin)["result"])')
  python3 -c "print('$a =', int('$hex',16)/10**18, 'SWYP on-chain')"
done
