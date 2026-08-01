#!/bin/bash
# Runda 2: surse stabile CC-BY (Blender Foundation open movies, test-videos.co.uk)
# + normalizare vertical 720x1280.
set -e
DIR=/tmp/test-clips
mkdir -p "$DIR/raw" "$DIR/out"
cd "$DIR/raw"

declare -A CLIPS=(
  [aventura_bunny]="https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_5MB.mp4"
  [robot_viitor]="https://download.blender.org/peach/trailer/trailer_1080p.mov"
  [cosmos_calatorie]="https://test-videos.co.uk/vids/jellyfish/mp4/h264/1080/Jellyfish_1080_10s_5MB.mp4"
  [oras_seara]="https://test-videos.co.uk/vids/sintel/mp4/h264/1080/Sintel_1080_10s_5MB.mp4"
)

for NAME in "${!CLIPS[@]}"; do
  URL="${CLIPS[$NAME]}"
  echo "== descarc $NAME =="
  curl -sL --max-time 90 -o "$NAME.src" "$URL" || { echo "  esec"; continue; }
  SIZE=$(stat -c%s "$NAME.src" 2>/dev/null || echo 0)
  [ "$SIZE" -lt 100000 ] && echo "  invalid ($SIZE B)" && rm -f "$NAME.src" && continue
  echo "  $((SIZE/1024/1024)) MB"
done

echo ""
echo "== normalizez =="
for F in "$DIR"/raw/*.src; do
  [ -e "$F" ] || continue
  BASE=$(basename "$F" .src)
  [ -e "$DIR/out/$BASE.mp4" ] && continue
  docker cp "$F" swypik-prod-video-worker-1:/tmp/in.vid
  docker exec swypik-prod-video-worker-1 sh -c "ffmpeg -y -i /tmp/in.vid -t 12 -vf 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280' -c:v libx264 -preset fast -crf 26 -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart /tmp/out.mp4 2>/dev/null" || { echo "  esec ffmpeg $BASE"; continue; }
  docker cp swypik-prod-video-worker-1:/tmp/out.mp4 "$DIR/out/$BASE.mp4"
  echo "  OK $BASE.mp4"
done
docker exec swypik-prod-video-worker-1 sh -c "rm -f /tmp/in.vid /tmp/out.mp4" 2>/dev/null || true

ls -la "$DIR/out/"
