#!/bin/bash
# Descarca clipuri de TEST din surse LEGALE (CC0 / licente libere):
# - Pexels/Pixabay-style CDN links (video stock gratuit, uz comercial permis)
# - Blender Foundation open movies (CC-BY)
# Le normalizeaza la vertical 720x1280 max 15s cu ffmpeg (in containerul worker).
set -e
DIR=/tmp/test-clips
mkdir -p "$DIR/raw" "$DIR/out"
cd "$DIR/raw"

# Surse: coverr.co (CC0-like license, free comercial), test-videos.co.uk (Blender CC-BY)
declare -A CLIPS=(
  [cafea_dimineata]="https://videos.pexels.com/video-files/2909914/2909914-hd_1080_1920_30fps.mp4"
  [moda_urbana]="https://videos.pexels.com/video-files/5822763/5822763-hd_1080_1920_25fps.mp4"
  [gatit_acasa]="https://videos.pexels.com/video-files/3196344/3196344-hd_1920_1080_25fps.mp4"
  [fitness_sala]="https://videos.pexels.com/video-files/4754030/4754030-hd_1080_1920_25fps.mp4"
  [tech_gadget]="https://videos.pexels.com/video-files/7742218/7742218-hd_1080_1920_25fps.mp4"
  [natura_munte]="https://videos.pexels.com/video-files/2871918/2871918-hd_1920_1080_30fps.mp4"
)

for NAME in "${!CLIPS[@]}"; do
  URL="${CLIPS[$NAME]}"
  echo "== descarc $NAME =="
  curl -sL --max-time 60 -o "$NAME.src.mp4" "$URL" || { echo "  esec download"; continue; }
  SIZE=$(stat -c%s "$NAME.src.mp4" 2>/dev/null || echo 0)
  [ "$SIZE" -lt 100000 ] && echo "  fisier invalid ($SIZE B), sar" && rm -f "$NAME.src.mp4" && continue
  echo "  $((SIZE/1024/1024)) MB"
done

echo ""
echo "== normalizez la 720x1280, max 12s, in containerul worker =="
for F in "$DIR"/raw/*.src.mp4; do
  [ -e "$F" ] || continue
  BASE=$(basename "$F" .src.mp4)
  docker cp "$F" swypik-prod-video-worker-1:/tmp/in.mp4
  docker exec swypik-prod-video-worker-1 sh -c "ffmpeg -y -i /tmp/in.mp4 -t 12 -vf 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280' -c:v libx264 -preset fast -crf 26 -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart /tmp/out.mp4 2>/dev/null"
  docker cp swypik-prod-video-worker-1:/tmp/out.mp4 "$DIR/out/$BASE.mp4"
  echo "  OK $BASE.mp4 ($(stat -c%s "$DIR/out/$BASE.mp4" | awk '{printf "%.1f", $1/1024/1024}') MB)"
done
docker exec swypik-prod-video-worker-1 sh -c "rm -f /tmp/in.mp4 /tmp/out.mp4"

echo ""
ls -la "$DIR/out/"
echo "GATA - ruleaza: bash import-test-clips.sh $DIR/out"
