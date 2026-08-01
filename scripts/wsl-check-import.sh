#!/bin/bash
# Progres import clipuri oficiale (WSL local).
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -c "
SELECT v.title, v.status, v.visibility, j.status AS job, left(v.playback_url,55) AS playback
FROM videos v
LEFT JOIN video_processing_jobs j ON j.video_id = v.id
WHERE v.creator_id = '00000000-0000-4000-9000-0000000f1c1a'
ORDER BY v.created_at;"
echo "=== joburi cu erori ==="
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -c "
SELECT j.status, j.job_type, left(coalesce(j.error_message,''),80) AS err, v.title
FROM video_processing_jobs j JOIN videos v ON v.id = j.video_id
WHERE v.creator_id = '00000000-0000-4000-9000-0000000f1c1a' AND j.status NOT IN ('succeeded')
ORDER BY j.created_at DESC LIMIT 5;"
echo "=== titluri in feed ==="
curl -s 'http://127.0.0.1:3005/api/explore/feed?limit=50' | grep -o '"title":"[^"]*"' | sort | uniq | head -20
