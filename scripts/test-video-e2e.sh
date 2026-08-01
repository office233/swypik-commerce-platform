#!/bin/bash
# Test E2E pipeline video pe productie:
# 1) genereaza clip test cu ffmpeg (in containerul worker, care are ffmpeg);
# 2) creeaza sesiune HTTP valida pentru un user admin (insert in user_sessions);
# 3) POST /api/creator/upload-session -> presigned URL;
# 4) PUT clipul in MinIO;
# 5) PATCH complete -> job in coada;
# 6) asteapta workerul si verifica video_assets + fisierele din MinIO.
set -e
PSQL="docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tAc"

echo "=== 0. User admin/creator existent ==="
USER_ID=$($PSQL "SELECT id FROM users WHERE role IN ('admin','creator') ORDER BY created_at LIMIT 1;")
echo "user: $USER_ID"
[ -z "$USER_ID" ] && echo "FARA USER - STOP" && exit 1

echo "=== 1. Generez clip test (2s, 720x1280) ==="
docker exec swypik-prod-video-worker-1 sh -c "ffmpeg -y -f lavfi -i testsrc=duration=2:size=720x1280:rate=30 -f lavfi -i sine=frequency=440:duration=2 -c:v libx264 -pix_fmt yuv420p -c:a aac /tmp/e2e-test.mp4 2>/dev/null && ls -la /tmp/e2e-test.mp4"
docker cp swypik-prod-video-worker-1:/tmp/e2e-test.mp4 /tmp/e2e-test.mp4

echo "=== 2. Sesiune HTTP de test ==="
TOKEN=$(head -c 32 /dev/urandom | xxd -p -c 64)
HASH=$(printf '%s' "$TOKEN" | sha256sum | cut -d' ' -f1)
$PSQL "INSERT INTO user_sessions (user_id, session_token_hash, expires_at) VALUES ('$USER_ID', '$HASH', now() + interval '1 hour');"
echo "sesiune creata"

echo "=== 3. POST upload-session ==="
SIZE=$(stat -c%s /tmp/e2e-test.mp4)
PRODUCT_ID=$($PSQL "SELECT id FROM marketplace_products LIMIT 1;")
echo "size: $SIZE, product: $PRODUCT_ID"
RESP=$(curl -s -X POST https://swypik.com/api/creator/upload-session \
  -H "Content-Type: application/json" \
  -H "Origin: https://swypik.com" \
  -H "Cookie: swypik_session=$TOKEN" \
  -d "{\"filename\":\"e2e-test.mp4\",\"contentType\":\"video/mp4\",\"sizeBytes\":$SIZE,\"title\":\"Test E2E pipeline\",\"description\":\"clip de verificare - va fi sters\",\"productId\":\"$PRODUCT_ID\"}")
echo "$RESP" | head -c 600
UPLOAD_URL=$(echo "$RESP" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('uploadUrl') or d.get('upload_url') or '')")
SESSION_ID=$(echo "$RESP" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('sessionId') or d.get('id') or '')")
echo ""
echo "sessionId: $SESSION_ID"
[ -z "$UPLOAD_URL" ] && echo "FARA UPLOAD URL - STOP" && exit 1

echo "=== 4. PUT clip in storage ==="
HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X PUT --data-binary @/tmp/e2e-test.mp4 -H "Content-Type: video/mp4" "$UPLOAD_URL")
echo "PUT -> $HTTP"

echo "=== 5. PATCH complete ==="
curl -s -X PATCH https://swypik.com/api/creator/upload-session \
  -H "Content-Type: application/json" \
  -H "Origin: https://swypik.com" \
  -H "Cookie: swypik_session=$TOKEN" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"action\":\"complete\"}" | head -c 400
echo ""

echo "=== 6. Astept workerul (25s) ==="
sleep 25
echo "--- video_assets ---"
$PSQL "SELECT id, status, object_key FROM video_assets ORDER BY created_at DESC LIMIT 3;"
echo "--- videos ---"
$PSQL "SELECT id, title, status FROM videos ORDER BY created_at DESC LIMIT 3;"
echo "--- fisiere in MinIO ---"
docker exec swypik-minio ls -R /data/swypik-media 2>/dev/null | head -20
echo "--- log worker ---"
docker logs swypik-prod-video-worker-1 --tail 8 2>&1
docker logs swypik-prod-video-worker-2 --tail 5 2>&1 | grep -i e2e || true

echo "=== 7. Curatenie sesiune ==="
$PSQL "DELETE FROM user_sessions WHERE session_token_hash = '$HASH';"
echo "DONE"
