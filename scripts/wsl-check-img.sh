#!/bin/bash
IMG=$(docker inspect swypik-prod-web-next-1 --format '{{.Image}}')
echo "imagine creata: $(docker inspect --format '{{.Created}}' "$IMG")"
docker exec swypik-prod-web-next-1 sh -c 'echo "BUILD_ID: $(cat .next/BUILD_ID 2>/dev/null)"; ls components/home/CategorySidebar.tsx >/dev/null 2>&1 && echo "sursa exista in imagine" || echo "sursa NU e in imagine (normal, doar standalone)"; C=$(grep -l "Serviciile Swypik" .next/static/chunks/*.js 2>/dev/null | head -2); if [ -n "$C" ]; then echo "CHUNKS VECHI: $C"; else echo "CHUNKS CURATE - fara Serviciile Swypik"; fi; Z=$(grep -l "Zboruri" .next/static/chunks/*.js 2>/dev/null | wc -l); echo "chunks cu Zboruri: $Z"'
