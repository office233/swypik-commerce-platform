#!/bin/bash
# Asteapta finalul deploy.sh (max ~10 min), apoi raporteaza starea.
for i in $(seq 1 40); do
  pgrep -f 'infra/hetzner/deploy.sh' >/dev/null || break
  sleep 15
done
echo "=== FINAL LOG ==="
tail -6 /tmp/deploy-pay.log
echo "=== CONTAINER ==="
docker ps --format '{{.Names}} {{.Status}}' | grep web-next
