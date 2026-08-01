#!/bin/bash
set -e
echo '--- procese cloudflared ---'
pgrep -a cloudflared || true
echo '--- IP actual web-next ---'
WIP=$(docker inspect swypik-prod-web-next-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
echo "IP: $WIP"
curl -s -o /dev/null -w "direct %{http_code}\n" -m 5 http://$WIP:3000/api/health
echo '--- actualizez config si omor dublurile ---'
sudo sed -i "s|http://172\.19\.0\.[0-9]*:3000|http://$WIP:3000|g" /etc/cloudflared/config.yml
sudo pkill -f 'cloudflared.*tunnel' || true
sleep 2
sudo systemctl restart cloudflared
sleep 8
pgrep -a cloudflared | head -3
curl -s -o /dev/null -w 'https health: %{http_code}\n' -m 20 https://swypik.com/api/health
