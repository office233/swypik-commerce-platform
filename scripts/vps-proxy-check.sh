#!/bin/bash
echo '=== nginx meister: domenii swypik/multi ==='
docker exec meister-nginx sh -c 'grep -rE "server_name|proxy_pass" /etc/nginx/ 2>/dev/null' | grep -iE 'swypik|multi|8090|8091|3005|3000' | head -20
echo '=== toate server_name ==='
docker exec meister-nginx sh -c 'grep -rhE "^\s*server_name" /etc/nginx/ 2>/dev/null' | sort -u | head -15
echo '=== cloudflared? ==='
docker ps -a --format '{{.Names}}' | grep -i cloudflare
systemctl status cloudflared 2>/dev/null | head -3
echo '=== cine raspunde la swypik.com (Host header local) ==='
curl -s -o /dev/null -w '%{http_code}' -H 'Host: swypik.com' http://localhost/
echo
