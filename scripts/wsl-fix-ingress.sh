#!/bin/bash
set -e
WIP=$(docker inspect swypik-prod-web-next-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' | head -1)
echo "web-next IP: $WIP"
curl -s -o /dev/null -w 'direct: %{http_code}\n' -m 5 http://$WIP:3000/api/health
sudo sed -i "s|hostname: swypik.com|hostname: swypik.com|; s|service: http://localhost:3005|service: http://$WIP:3000|g" /etc/cloudflared/config.yml
grep -A1 'swypik.com$' /etc/cloudflared/config.yml | head -6
sudo systemctl restart cloudflared
sleep 6
curl -s -o /dev/null -w 'https://swypik.com/api/health -> %{http_code}\n' -m 15 https://swypik.com/api/health
