#!/bin/bash
# Verificare după ștergerea clipurilor de test.
echo "=== useri in feed ==="
curl -s 'http://127.0.0.1:3005/api/explore/feed?limit=20' | grep -o '"username":"[^"]*"' | sort | uniq -c
echo "=== spatiu MinIO ==="
docker exec swypik-minio du -sh /data/swypik-media
echo "=== videos in DB ==="
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tAc "SELECT count(1) FROM videos;"
