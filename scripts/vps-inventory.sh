#!/bin/bash
echo '=== swypik-chain dir ==='
du -sh /opt/swypik-chain 2>/dev/null
echo '=== MOUNTS SWYPIK ==='
for c in swypik-chain swypik-chain-rpc swypik-blockscout swypik-bs-postgres swypik-minio swypik-prod-postgres-1 swypik-prod-web-next-1; do
  echo "-- $c"
  docker inspect "$c" --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}
{{end}}' 2>/dev/null | grep -v '^$'
done
echo '=== MOUNTS MULTI-ERP ==='
for c in multi-erp-backend multi-erp-postgres; do
  echo "-- $c"
  docker inspect "$c" --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}
{{end}}' 2>/dev/null | grep -v '^$'
done
echo '=== VOLUME SIZES ==='
docker system df -v 2>/dev/null | grep -iE 'swypik|multi'
echo '=== CRON root ==='
crontab -l 2>/dev/null | grep -iE 'swypik|multi'
echo '=== CRON deploy ==='
crontab -l -u deploy 2>/dev/null | grep -iE 'swypik|multi'
echo '=== SYSTEMD ==='
systemctl list-units --type=service --all 2>/dev/null | grep -iE 'swypik|multi' | head
echo '=== NGINX/CADDY ==='
ls /etc/nginx/sites-enabled/ 2>/dev/null
ls /etc/caddy 2>/dev/null
grep -rl 'swypik\|multi' /etc/nginx/sites-enabled/ /etc/caddy 2>/dev/null
echo '=== ENV FILES swypik ==='
find /opt/swypik /opt/swypik-chain /opt/multi-erp -name '.env*' -o -name '*.env' 2>/dev/null
echo '=== DISK FREE ==='
df -h / | tail -1
