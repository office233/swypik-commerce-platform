#!/bin/bash
# Status rapid stack local WSL (rulat cu: wsl -d swypik -- bash /mnt/e/Meister/swypik/app/scripts/wsl-quick-status.sh)
PSQL="docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tAc"
echo "=== web 3005 ==="
curl -s -o /dev/null -w '%{http_code}\n' -m 8 http://127.0.0.1:3005/
echo "=== profil oficial ==="
$PSQL "SELECT username, role, is_verified FROM users WHERE username='swypik';"
echo "=== creator_profiles ==="
$PSQL "SELECT handle, verification_status FROM creator_profiles;"
echo "=== videos ==="
$PSQL "SELECT count(1) FROM videos;"
echo "=== workeri ==="
docker ps --format '{{.Names}} {{.Status}}' | grep -E 'video-worker|minio'
