#!/bin/bash
echo "=== ENV in container (nume doar) ==="
docker exec swypik-prod-web-next-1 env | grep -E 'AUTH_SECRET|SWYP' | cut -d= -f1

echo "=== logs web-next: erori wallet/chain ==="
docker logs swypik-prod-web-next-1 --since 30m 2>&1 | grep -iE 'wallet|chain|swyp' | grep -iE 'error|fail' | tail -8

echo "=== conectivitate RPC din container ==="
docker exec swypik-prod-web-next-1 node -e "
fetch(process.env.SWYP_CHAIN_RPC || 'http://swypik-chain-rpc:8545', {
  method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({jsonrpc:'2.0',method:'eth_blockNumber',id:1})
}).then(r=>r.json()).then(j=>console.log('RPC OK, bloc:', parseInt(j.result,16))).catch(e=>console.log('RPC FAIL:', e.message))
" 2>&1

echo "=== apel direct /api/swyp/mining (fara auth -> 401 e ok) ==="
docker exec swypik-prod-web-next-1 node -e "
fetch('http://127.0.0.1:3000/api/swyp/mining').then(r=>console.log('status:',r.status)).catch(e=>console.log('FAIL:',e.message))
" 2>&1

echo "=== tabela swyp_chain_wallets ==="
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -t -A -c "select count(*) from swyp_chain_wallets" 2>&1
