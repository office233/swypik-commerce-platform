#!/bin/bash
for h in swypik.com www.swypik.com cdn.swypik.com rpc.swypik.com scan.swypik.com api.swypik.com erp.swypik.com test.erp.swypik.com; do
  printf '%s: ' "$h"
  dig +short "$h" @1.1.1.1 | head -2 | tr '\n' ' '
  echo
done
echo '--- live checks ---'
for u in https://swypik.com/api/health https://swypik.com/ro https://cdn.swypik.com/minio/health/live https://scan.swypik.com/ https://erp.swypik.com/healthz; do
  printf '%s -> %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' -m 15 "$u")"
done
