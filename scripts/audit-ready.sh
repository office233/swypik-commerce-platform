#!/bin/bash
Q() { docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -t -A -F'|' -c "$1" 2>&1; }

echo "=== 1. BACKUP CHEI TREZORERIE (critic!) ==="
ls -la /opt/swypik-chain/keystore-init/ 2>/dev/null | tail -8
echo "--- accounts.env exista? ---"
ls -la /opt/swypik-chain/accounts.env /opt/swypik-chain/password.txt 2>/dev/null
echo "--- exista in backup offsite? ---"
ls -la /root/backups/ 2>/dev/null | grep -i chain || echo "NU EXISTA BACKUP CHAIN!"

echo ""
echo "=== 2. WALLETS USERI ==="
Q "select count(*) from swyp_chain_wallets;"

echo ""
echo "=== 3. ROUTES API SWYP LIVE? ==="
for p in /api/swyp/balance /api/swyp/withdraw /api/swyp/mining /api/swyp/rate; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 8 "https://swypik.com$p")
  echo "$p -> $code"
done

echo ""
echo "=== 4. CRON EMISIUNE/VALUATION RULEAZA? ==="
crontab -l 2>/dev/null | grep -Ei "swyp|valuation|emission" || echo "NICIUN CRON SWYP"
docker logs --tail 20 swypik-prod-cron-worker-1 2>&1 | grep -Ei "swyp|valuation" | tail -5 || echo "nimic in cron worker"

echo ""
echo "=== 5. VALIDATOR: unlock persistent dupa restart? ==="
grep -E "unlock|password" /opt/swypik-chain/docker-compose.yml | head -5

echo ""
echo "=== 6. RESTART POLICY ==="
docker inspect swypik-chain --format '{{.HostConfig.RestartPolicy.Name}}'
docker inspect swypik-chain-rpc --format '{{.HostConfig.RestartPolicy.Name}}'
