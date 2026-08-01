#!/bin/bash
# Import clipuri de TEST (ex. de pe YouTube) prin pipeline-ul real de upload.
#
# Utilizare (pe VPS):  bash import-test-clips.sh /cale/catre/folder-cu-mp4
#
# - fiecare .mp4 din folder trece prin fluxul real: upload-session -> PUT
#   presigned in MinIO -> PATCH complete -> worker HLS;
# - titlul = numele fisierului (fara extensie, underscore -> spatiu);
# - toate clipurile sunt marcate tags = ['test-content'] ca sa poata fi
#   sterse dintr-un foc inainte de lansare cu: bash cleanup-test-clips.sh
# - visibility ramane cea implicita a pipeline-ului; publicarea se face
#   separat (admin / API), NU aici.
set -e
DIR="${1:?Utilizare: import-test-clips.sh /folder/cu/clipuri}"
PSQL="docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tAc"
NET=$(docker inspect swypik-minio -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')

USER_ID=$($PSQL "SELECT id FROM users WHERE role IN ('admin','creator') ORDER BY created_at LIMIT 1;")
[ -z "$USER_ID" ] && echo "FARA USER admin/creator" && exit 1

TOKEN=$(head -c 32 /dev/urandom | xxd -p -c 64)
HASH=$(printf '%s' "$TOKEN" | sha256sum | cut -d' ' -f1)
$PSQL "INSERT INTO user_sessions (user_id, session_token_hash, expires_at) VALUES ('$USER_ID', '$HASH', now() + interval '2 hours');" >/dev/null
trap "$PSQL \"DELETE FROM user_sessions WHERE session_token_hash='$HASH';\" >/dev/null" EXIT

OK=0; ERR=0
for F in "$DIR"/*.mp4; do
  [ -e "$F" ] || { echo "niciun .mp4 in $DIR"; exit 1; }
  BASE=$(basename "$F" .mp4)
  TITLE=$(echo "$BASE" | tr '_-' '  ' | sed 's/  */ /g')
  SIZE=$(stat -c%s "$F")
  echo "== $BASE ($((SIZE/1024)) KB) =="

  RESP=$(curl -s -X POST https://swypik.com/api/creator/upload-session \
    -H "Content-Type: application/json" -H "Origin: https://swypik.com" \
    -H "Cookie: swypik_session=$TOKEN" \
    -d "{\"filename\":\"$BASE.mp4\",\"contentType\":\"video/mp4\",\"sizeBytes\":$SIZE,\"title\":\"$TITLE\",\"description\":\"[TEST] Continut temporar de test - se sterge inainte de lansare.\"}")
  UPLOAD_URL=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin).get('uploadUrl',''))" 2>/dev/null)
  SESSION_ID=$(echo "$RESP" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('sessionId') or d.get('id') or '')" 2>/dev/null)
  if [ -z "$UPLOAD_URL" ]; then echo "  EROARE sesiune: $RESP"; ERR=$((ERR+1)); continue; fi

  HTTP=$(docker run --rm --network "$NET" -v "$F":/f.mp4:ro curlimages/curl:latest \
    -s -o /dev/null -w '%{http_code}' -X PUT --data-binary @/f.mp4 -H "Content-Type: video/mp4" "$UPLOAD_URL")
  if [ "$HTTP" != "200" ]; then echo "  EROARE PUT: $HTTP"; ERR=$((ERR+1)); continue; fi

  curl -s -X PATCH https://swypik.com/api/creator/upload-session \
    -H "Content-Type: application/json" -H "Origin: https://swypik.com" \
    -H "Cookie: swypik_session=$TOKEN" \
    -d "{\"sessionId\":\"$SESSION_ID\",\"action\":\"complete\"}" >/dev/null

  # Marcheaza clipul ca test-content (tag) pentru curatare usoara.
  $PSQL "UPDATE videos SET tags = array_append(COALESCE(tags,'{}'), 'test-content') WHERE id = (SELECT video_id FROM video_upload_sessions WHERE id='$SESSION_ID');" >/dev/null
  echo "  OK -> sesiune $SESSION_ID"
  OK=$((OK+1))
done

echo ""
echo "=== import: $OK ok, $ERR erori. Astept procesarea (30s)... ==="
sleep 30
$PSQL "SELECT title, status, visibility FROM videos WHERE 'test-content' = ANY(tags) ORDER BY created_at DESC;"
echo ""
echo "Publicare (cand esti gata): UPDATE videos SET visibility='public', status='ready' ... prin admin."
echo "Stergere totala inainte de lansare: bash cleanup-test-clips.sh"
