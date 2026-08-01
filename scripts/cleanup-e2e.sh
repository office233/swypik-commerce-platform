#!/bin/bash
PSQL="docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tAc"
$PSQL "DELETE FROM video_product_links WHERE video_id IN (SELECT id FROM videos WHERE title LIKE 'Test E2E%');"
$PSQL "DELETE FROM video_assets WHERE video_id IN (SELECT id FROM videos WHERE title LIKE 'Test E2E%');"
$PSQL "DELETE FROM video_upload_sessions WHERE video_id IN (SELECT id FROM videos WHERE title LIKE 'Test E2E%');"
$PSQL "DELETE FROM videos WHERE title LIKE 'Test E2E%';"
echo "curatat: $($PSQL "SELECT count(*) FROM videos;") videos ramase"
