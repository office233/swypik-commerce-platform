#!/bin/bash
# Audit infrastructura VPS — READ-ONLY, nu modifica nimic.
echo "=== 1. UPTIME / LOAD / DISK / RAM ==="
uptime
df -h / /var/lib/docker 2>/dev/null | grep -v tmpfs
free -h | head -2

echo ""
echo "=== 2. CONTAINERE (status + restart count) ==="
docker ps -a --format '{{.Names}}\t{{.Status}}' | sort
echo "--- restart counts ---"
for c in $(docker ps -q); do
  n=$(docker inspect -f '{{.Name}} {{.RestartCount}}' $c)
  echo "$n"
done | sort -k2 -rn | head -10

echo ""
echo "=== 3. CONTAINERE UNHEALTHY / EXITED ==="
docker ps -a --filter health=unhealthy --format '{{.Names}}'
docker ps -a --filter status=exited --format '{{.Names}} ({{.Status}})'

echo ""
echo "=== 4. CRONTAB ROOT ==="
crontab -l 2>/dev/null | grep -v '^#' | grep -v '^$'

echo ""
echo "=== 5. BACKUP: ultimele fisiere locale + storagebox ==="
ls -lht /var/backups/ 2>/dev/null | head -5
ls -lht /opt/backups/ 2>/dev/null | head -8
echo "--- storagebox ---"
ssh -p 23 -i /root/.ssh/storagebox_ed25519 -o StrictHostKeyChecking=no -o ConnectTimeout=10 u643366@u643366.your-storagebox.de 'ls -lht backups/ 2>/dev/null | head -10' 2>&1

echo ""
echo "=== 6. CERTIFICATE TLS (expirare) ==="
for d in swypik.com scan.swypik.com; do
  exp=$(echo | timeout 8 openssl s_client -servername $d -connect $d:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null)
  echo "$d: $exp"
done

echo ""
echo "=== 7. DOCKER LOGS: erori recente (ultimele 24h) ==="
for c in swypik-prod-web-next-1 swypik-prod-cron-worker-1 swypik-prod-platform-api-1 swypik-chain swypik-prod-postgres-1; do
  echo "--- $c ---"
  docker logs --since 24h $c 2>&1 | grep -iE 'error|fatal|panic|ECONNREFUSED|out of memory' | grep -viE 'error_page|no error' | tail -5
done

echo ""
echo "=== 8. POSTGRES: dimensiune DB + conexiuni ==="
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tAc "SELECT pg_size_pretty(pg_database_size('swypik_prod'));" 2>/dev/null
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tAc "SELECT count(*) || ' conexiuni active' FROM pg_stat_activity;" 2>/dev/null

echo ""
echo "=== 9. MIGRATII: aplicate vs fisiere ==="
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tAc "SELECT count(*) FROM schema_migrations;" 2>/dev/null || echo "(fara tabela schema_migrations)"

echo ""
echo "=== 10. FIREWALL / PORTURI EXPUSE ==="
ss -tlnp 2>/dev/null | grep -v 127.0.0.1 | grep LISTEN | awk '{print $4, $6}' | sort -u | head -20
ufw status 2>/dev/null | head -5 || iptables -L INPUT -n --line-numbers 2>/dev/null | head -8

echo ""
echo "=== 11. SWAP / OOM kills recente ==="
dmesg -T 2>/dev/null | grep -i 'killed process' | tail -3
swapon --show

echo ""
echo "=== 12. SPATIU DOCKER (images/volumes orfane) ==="
docker system df
