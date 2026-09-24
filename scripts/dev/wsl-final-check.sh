#!/bin/bash
echo '--- pagini principale ---'
for p in / /explore /feed; do
  printf 'swypik.com%s -> %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' -m 30 -L https://swypik.com$p)"
done
echo '--- subdomenii ---'
printf 'www -> %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -m 20 -L https://www.swypik.com/)"
printf 'cdn -> %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -m 15 https://cdn.swypik.com/minio/health/live)"
printf 'erp -> %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -m 15 https://erp.swypik.com/healthz)"
printf 'api -> %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -m 15 https://api.swypik.com/healthz)"
