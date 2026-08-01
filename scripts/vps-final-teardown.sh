#!/bin/bash
# ȘTERGERE DEFINITIVĂ swypik + multi-erp de pe VPS. Meister NEATINS.
set -e

echo '== 1. nginx.conf curat (testat inainte de reload) =='
cp /tmp/nginx-clean.conf /opt/meister/nginx/nginx.conf
docker exec meister-nginx nginx -t 2>&1 | tail -1
docker exec meister-nginx nginx -s reload
sleep 2
curl -s -o /dev/null -w 'meister erp.meistercom.ro: %{http_code}\n' -m 10 -k https://localhost/ -H 'Host: erp.meistercom.ro' || true

echo '== 2. Sterg containerele swypik + multi-erp =='
docker ps -a --format '{{.Names}}' | grep -E '^(swypik|multi-erp)' | xargs -r docker rm -f

echo '== 3. Sterg volumele =='
docker volume ls --format '{{.Name}}' | grep -iE 'swypik|multi' | xargs -r docker volume rm

echo '== 4. Sterg imaginile =='
docker images --format '{{.ID}} {{.Repository}}' | grep -iE 'swypik|multi-erp|blockscout' | awk '{print $1}' | sort -u | xargs -r docker rmi -f 2>/dev/null | tail -2 || true

echo '== 5. Sterg folderele =='
rm -rf /opt/swypik /opt/swypik-chain /opt/multi-erp
rm -f /usr/local/bin/swypik-chain-health.sh /usr/local/bin/swypik-peer-watchdog.sh

echo '== 6. Curat crontab de intrarile #MIGRATED# =='
crontab -l | grep -v '#MIGRATED#' | crontab -
crontab -l | grep -ci swypik || true

echo '== 7. Sterg backup-ul temporar /root/migrate (avem copia pe E:) =='
rm -rf /root/migrate

echo '== 8. Stare finala =='
docker ps --format '{{.Names}}\t{{.Status}}'
df -h / | tail -1
echo TEARDOWN_DONE
