#!/bin/bash
# Genereaza un clip de test 9:16 de 6s cu ffmpeg din video-worker.
set -e
W=$(docker ps --format '{{.Names}}' | grep -i video-worker | head -1)
docker exec "$W" sh -c 'ffmpeg -y -loglevel error -f lavfi -i "testsrc2=size=720x1280:rate=30:duration=6" -f lavfi -i "sine=frequency=440:duration=6" -c:v libx264 -pix_fmt yuv420p -c:a aac /tmp/test-clip.mp4 && ls -la /tmp/test-clip.mp4'
docker cp "$W":/tmp/test-clip.mp4 /tmp/test-clip.mp4
ls -la /tmp/test-clip.mp4
cp /tmp/test-clip.mp4 /mnt/e/Meister/swypik/app/tmp-test-clip.mp4 2>/dev/null || true
echo GEN_OK
