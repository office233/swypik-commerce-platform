#!/bin/bash
# Șterge clipurile de test ale userului de audit (DB + fișiere MinIO).
set -e
PSQL="docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod"

echo "=== clipuri de sters ==="
IDS=$($PSQL -tAc "SELECT v.id FROM videos v JOIN users u ON u.id=v.creator_id WHERE u.username LIKE 'audit%';")
echo "$IDS"
[ -z "$IDS" ] && echo "nimic de sters" && exit 0

# 1. Fișiere MinIO (hls + raw)
for id in $IDS; do
  docker exec swypik-minio sh -c "rm -rf /data/swypik-media/videos/hls/$id /data/swypik-media/videos/raw/$id* 2>/dev/null" || true
done
# raw-urile pot fi sub sesiuni separate — șterge după object_key din video_assets
$PSQL -tAc "SELECT object_key FROM video_assets WHERE video_id IN (SELECT v.id FROM videos v JOIN users u ON u.id=v.creator_id WHERE u.username LIKE 'audit%');" | while read -r key; do
  [ -n "$key" ] && docker exec swypik-minio sh -c "rm -rf '/data/swypik-media/$key' 2>/dev/null" || true
done

# 2. Rânduri DB (jobs -> assets -> sesiuni -> videos)
docker exec -i swypik-prod-postgres-1 psql -U swypik -d swypik_prod -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
CREATE TEMP TABLE del_ids AS
  SELECT v.id FROM videos v JOIN users u ON u.id = v.creator_id WHERE u.username LIKE 'audit%';
DELETE FROM video_processing_jobs WHERE video_id IN (SELECT id FROM del_ids);
DELETE FROM video_assets WHERE video_id IN (SELECT id FROM del_ids);
DELETE FROM video_upload_sessions WHERE video_id IN (SELECT id FROM del_ids);
-- toate tabelele cu FK spre videos (fara CASCADE garantat)
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT DISTINCT tc.table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'videos' AND kcu.column_name = 'video_id'
  LOOP
    EXECUTE format('DELETE FROM %I WHERE video_id IN (SELECT id FROM del_ids)', t);
  END LOOP;
END $$;
DELETE FROM videos WHERE id IN (SELECT id FROM del_ids);
COMMIT;
SQL

echo "=== ramase ==="
$PSQL -c "SELECT v.title, u.username FROM videos v JOIN users u ON u.id=v.creator_id ORDER BY v.created_at;"
