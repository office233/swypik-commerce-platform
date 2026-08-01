#!/bin/bash
echo '--- pagini principale ---'
for p in / /explore /swyp /feed; do
  printf 'swypik.com%s -> %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' -m 30 -L https://swypik.com$p)"
done
echo '--- subdomenii ---'
printf 'www -> %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -m 20 -L https://www.swypik.com/)"
printf 'cdn -> %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -m 15 https://cdn.swypik.com/minio/health/live)"
printf 'scan -> %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -m 20 https://scan.swypik.com/)"
printf 'erp -> %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -m 15 https://erp.swypik.com/healthz)"
printf 'rpc -> %s\n' "$(curl -s -m 10 -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' https://rpc.swypik.com | head -c 80)"
echo
printf 'api -> %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -m 15 https://api.swypik.com/healthz)"
