#!/bin/bash
# Health complet al stack-ului local WSL dupa migrarea de pe VPS.
echo "=== CHAIN: bloc curent + mining ==="
docker exec swypik-chain geth attach --exec 'eth.blockNumber' /data/geth.ipc 2>/dev/null || echo "validator NU raspunde"
docker exec swypik-chain-rpc geth attach --exec 'net.peerCount' /data/geth.ipc 2>/dev/null || echo "rpc NU raspunde"

echo "=== WEB local ==="
curl -s -o /dev/null -w 'health: %{http_code}\n' -m 8 http://127.0.0.1:3000/api/health 2>/dev/null || echo "web NU raspunde pe 3000"

echo "=== CLOUDFLARED ==="
pgrep -a cloudflared | head -2 || echo "cloudflared NU ruleaza"
systemctl is-active cloudflared 2>/dev/null || service cloudflared status 2>/dev/null | head -2 || true

echo "=== PUBLIC: swypik.com ==="
curl -s -o /dev/null -w 'swypik.com: %{http_code}\n' -m 10 https://swypik.com/api/health
curl -s -o /dev/null -w 'scan: %{http_code}\n' -m 10 https://scan.swypik.com/ 2>/dev/null
curl -s -o /dev/null -w 'rpc: %{http_code}\n' -m 10 https://rpc.swypik.com/ 2>/dev/null

echo "=== SWYP date ==="
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -t -A -c "select 'balante:'||count(*) from swyp_balances where balance_units>0" 2>/dev/null
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -t -A -c "select 'wallets:'||count(*) from swyp_chain_wallets" 2>/dev/null
echo "=== CRON worker ==="
docker logs swypik-prod-cron-worker-1 --since 5m 2>&1 | tail -3
