#!/bin/bash
# Sincronizează repo-ul local WSL cu git și copiază favicon-urile în containerul care rulează
set -e
cd /opt/swypik/app
sudo -u dev git pull -q origin main 2>/dev/null || git pull -q origin main
docker cp public/favicon.svg swypik-prod-web-next-1:/app/public/favicon.svg
docker cp public/favicon.ico swypik-prod-web-next-1:/app/public/favicon.ico
echo COPIED
curl -s -o /dev/null -w 'favicon.ico: %{http_code} %{size_download}b\n' http://localhost:3005/favicon.ico
