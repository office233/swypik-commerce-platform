#!/bin/bash
# Publică clipurile oficiale gata (ready → public) și arată starea finală.
PSQL="docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod"
$PSQL -c "
UPDATE videos
SET visibility = 'public', updated_at = NOW()
WHERE creator_id = '00000000-0000-4000-9000-0000000f1c1a'
  AND status = 'ready' AND visibility <> 'public';"
$PSQL -c "
SELECT v.title, v.status, v.visibility, left(v.playback_url,55) AS playback
FROM videos v
WHERE v.creator_id = '00000000-0000-4000-9000-0000000f1c1a'
ORDER BY v.created_at;"
