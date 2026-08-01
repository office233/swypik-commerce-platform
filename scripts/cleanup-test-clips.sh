#!/bin/bash
# Sterge TOT continutul de test (tag 'test-content') inainte de lansare:
# DB (videos + assets + sesiuni + linkuri produse) si fisierele din MinIO.
set -e
PSQL="docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tAc"

echo "=== clipuri de test gasite ==="
$PSQL "SELECT id, title FROM videos WHERE 'test-content' = ANY(tags);"

echo "=== sterg fisierele din MinIO ==="
for VID in $($PSQL "SELECT id FROM videos WHERE 'test-content' = ANY(tags);"); do
  docker exec swypik-minio rm -rf "/data/swypik-media/videos/hls/$VID" 2>/dev/null || true
done
for KEY in $($PSQL "SELECT object_key FROM video_assets WHERE video_id IN (SELECT id FROM videos WHERE 'test-content' = ANY(tags)) AND object_key IS NOT NULL;"); do
  docker exec swypik-minio rm -f "/data/swypik-media/$KEY" 2>/dev/null || true
done

echo "=== sterg din DB ==="
$PSQL "DELETE FROM video_product_links WHERE video_id IN (SELECT id FROM videos WHERE 'test-content' = ANY(tags));"
$PSQL "DELETE FROM video_assets WHERE video_id IN (SELECT id FROM videos WHERE 'test-content' = ANY(tags));"
$PSQL "DELETE FROM video_upload_sessions WHERE video_id IN (SELECT id FROM videos WHERE 'test-content' = ANY(tags));"
$PSQL "DELETE FROM videos WHERE 'test-content' = ANY(tags);"
echo "GATA - continut de test eliminat complet."
