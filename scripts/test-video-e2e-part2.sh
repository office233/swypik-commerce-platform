#!/bin/bash
# Partea 2 E2E: PUT clipul pe presigned URL DIN reteaua docker (ca browserul
# intern), PATCH complete, asteapta workerul, verifica asset + MinIO + feed.
set -e
PSQL="docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tAc"
USER_ID=$($PSQL "SELECT id FROM users WHERE role IN ('admin','creator') ORDER BY created_at LIMIT 1;")

TOKEN=$(head -c 32 /dev/urandom | xxd -p -c 64)
HASH=$(printf '%s' "$TOKEN" | sha256sum | cut -d' ' -f1)
$PSQL "INSERT INTO user_sessions (user_id, session_token_hash, expires_at) VALUES ('$USER_ID', '$HASH', now() + interval '1 hour');" >/dev/null

SIZE=$(stat -c%s /tmp/e2e-test.mp4)
PRODUCT_ID=$($PSQL "SELECT id FROM marketplace_products LIMIT 1;")

RESP=$(curl -s -X POST https://swypik.com/api/creator/upload-session \
  -H "Content-Type: application/json" -H "Origin: https://swypik.com" \
  -H "Cookie: swypik_session=$TOKEN" \
  -d "{\"filename\":\"e2e-test.mp4\",\"contentType\":\"video/mp4\",\"sizeBytes\":$SIZE,\"title\":\"Test E2E pipeline\",\"productId\":\"$PRODUCT_ID\"}")
UPLOAD_URL=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin).get('uploadUrl',''))")
SESSION_ID=$(echo "$RESP" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('sessionId') or d.get('id') or '')")
echo "sessionId: $SESSION_ID"
[ -z "$UPLOAD_URL" ] && echo "$RESP" && exit 1

echo "=== PUT din reteaua docker ==="
docker cp /tmp/e2e-test.mp4 swypik-prod-web-next-1:/tmp/e2e.mp4 2>/dev/null || true
HTTP=$(docker run --rm --network $(docker inspect swypik-minio -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}') -v /tmp/e2e-test.mp4:/f.mp4:ro curlimages/curl:latest -s -o /dev/null -w '%{http_code}' -X PUT --data-binary @/f.mp4 -H "Content-Type: video/mp4" "$UPLOAD_URL")
echo "PUT -> $HTTP"

echo "=== PATCH complete ==="
curl -s -X PATCH https://swypik.com/api/creator/upload-session \
  -H "Content-Type: application/json" -H "Origin: https://swypik.com" \
  -H "Cookie: swypik_session=$TOKEN" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"action\":\"complete\"}" | head -c 300
echo ""

echo "=== astept worker 30s ==="
sleep 30
echo "--- upload session ---"
$PSQL "SELECT status FROM video_upload_sessions WHERE id='$SESSION_ID';"
echo "--- video_assets ---"
$PSQL "SELECT status, object_key FROM video_assets ORDER BY created_at DESC LIMIT 2;"
echo "--- videos ---"
$PSQL "SELECT id, title, status FROM videos ORDER BY created_at DESC LIMIT 2;"
echo "--- product links ---"
$PSQL "SELECT video_id, product_id FROM video_product_links ORDER BY created_at DESC LIMIT 2;" 2>/dev/null || $PSQL "SELECT count(*) FROM video_product_links;"
echo "--- MinIO files ---"
docker exec swypik-minio ls -R /data/swypik-media/videos 2>/dev/null | head -15
echo "--- feed public ---"
curl -s "https://swypik.com/api/explore/feed?limit=3" | python3 -c "import json,sys;d=json.load(sys.stdin);print('videos in feed:',len(d.get('videos',[])));[print(' -',v.get('title'),v.get('id')) for v in d.get('videos',[])]"

$PSQL "DELETE FROM user_sessions WHERE session_token_hash='$HASH';" >/dev/null
echo DONE
