#!/bin/bash
# Audit final: mai există URME swypik/multi-erp pe VPS?
echo '=== 1. Containere ==='
docker ps -a --format '{{.Names}}' | grep -iE 'swypik|multi' || echo CURAT
echo '=== 2. Volume ==='
docker volume ls --format '{{.Name}}' | grep -iE 'swypik|multi' || echo CURAT
echo '=== 3. Imagini ==='
docker images --format '{{.Repository}}:{{.Tag}}' | grep -iE 'swypik|multi|blockscout|geth|ethereum' || echo CURAT
echo '=== 4. Retele ==='
docker network ls --format '{{.Name}}' | grep -iE 'swypik|multi' || echo CURAT
echo '=== 5. Foldere /opt ==='
ls /opt | grep -iE 'swypik|multi' || echo CURAT
echo '=== 6. /root, /home, /tmp, /var ==='
ls /root /home 2>/dev/null | grep -iE 'swypik|multi|migrate' || echo 'CURAT root/home'
find /tmp /var/tmp -maxdepth 1 -iname '*swypik*' -o -maxdepth 1 -iname '*multi*' 2>/dev/null | head -5 || true
echo '=== 7. Cron root + deploy ==='
crontab -l 2>/dev/null | grep -iE 'swypik|multi' || echo 'CURAT cron root'
crontab -l -u deploy 2>/dev/null | grep -iE 'swypik|multi' || echo 'CURAT cron deploy'
echo '=== 8. Systemd ==='
systemctl list-units --all 2>/dev/null | grep -iE 'swypik|multi' || echo CURAT
ls /etc/systemd/system/ | grep -iE 'swypik|multi' || true
echo '=== 9. Scripturi /usr/local/bin ==='
ls /usr/local/bin/ | grep -iE 'swypik|multi' || echo CURAT
echo '=== 10. nginx config ==='
docker exec meister-nginx grep -ci swypik /etc/nginx/nginx.conf || echo 'CURAT (0 match nginx activ)'
grep -c swypik /opt/meister/nginx/nginx.conf 2>/dev/null || true
echo '=== 11. Certificate origin ==='
ls /etc/cloudflare-origin/ 2>/dev/null | grep -i swypik || echo 'CURAT sau folder inexistent'
echo '=== 12. User deploy: repos ==='
ls /home/deploy 2>/dev/null | head; sudo -u deploy bash -c 'ls ~' 2>/dev/null | grep -iE 'swypik|multi' || echo 'CURAT deploy home'
echo '=== 13. Docker builder cache ==='
docker system df | tail -4
echo '=== 14. Ce ruleaza (final) ==='
docker ps --format '{{.Names}}\t{{.Status}}'
echo '=== 15. Disc ==='
df -h / | tail -1
