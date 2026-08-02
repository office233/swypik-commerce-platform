#!/bin/bash
IMG=$(docker inspect swypik-prod-web-next-1 --format '{{.Image}}')
echo "imagine creata: $(docker inspect --format '{{.Created}}' "$IMG")"
docker exec swypik-prod-web-next-1 sh -c 'cat .next/BUILD_ID 2>/dev/null; echo; grep -rn "Serviciile Swypik" components/home/CategorySidebar.tsx 2>/dev/null | head -1 && echo "SURSA IN IMAGINE E VECHE" || echo "sursa in imagine e curata"; grep -l "Serviciile Swypik" .next/static/chunks/*.js 2>/dev/null | head -2'
