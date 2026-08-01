#!/bin/bash
# Asteapta orice build/compose web-next in curs (max ~20 min), apoi verifica.
for i in $(seq 1 80); do
  pgrep -f 'docker compose.*build web-next' >/dev/null || break
  sleep 15
done
sleep 10
docker ps --format '{{.Names}} {{.Status}}' | grep web-next
echo "=== SWYP ==="
curl -s -o /dev/null -w '%{http_code}\n' -L https://swypik.com/ro/swyp
echo "=== HEALTH ==="
curl -s -o /dev/null -w '%{http_code}\n' https://swypik.com/api/health
