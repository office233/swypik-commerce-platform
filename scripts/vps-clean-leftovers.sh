#!/bin/bash
set -e
echo '== imagine geth (chain) =='
docker rmi ethereum/client-go:v1.13.15 2>&1 | tail -1 || true
echo '== retele orfane =='
docker network rm multi-erp_default swypik-chain_default swypik-prod_default 2>&1 || true
echo '== fisiere temp =='
rm -f /tmp/swypik-theme.css /tmp/nginx-clean.conf /tmp/td.sh /tmp/ca.sh /tmp/cmp.sh /tmp/pc.sh /tmp/inv.sh /tmp/bk.sh /tmp/td1.sh /tmp/ftc.sh /tmp/itc.sh 2>/dev/null || true
rm -rf /tmp/test-clips 2>/dev/null || true
echo '== comentarii swypik din nginx (doar linii de comentariu, sigur) =='
sed -i '/^\s*#.*[Ss]wypik/d' /opt/meister/nginx/nginx.conf
grep -ci swypik /opt/meister/nginx/nginx.conf || echo '0 in fisierul montat'
docker exec meister-nginx nginx -t 2>&1 | tail -1
docker exec meister-nginx nginx -s reload
docker exec meister-nginx grep -ci swypik /etc/nginx/nginx.conf || echo '0 in nginx activ'
echo '== build cache (23.6GB — al build-urilor swypik/multi) =='
docker builder prune -af 2>&1 | tail -1
echo '== verificare finala =='
docker network ls --format '{{.Name}}' | grep -iE 'swypik|multi' || echo 'RETELE CURATE'
docker images --format '{{.Repository}}' | grep -iE 'swypik|multi|geth|ethereum|blockscout' || echo 'IMAGINI CURATE'
curl -s -o /dev/null -w 'meister-nginx health: %{http_code}\n' -m 5 http://localhost/health
df -h / | tail -1
echo CLEANUP_DONE
