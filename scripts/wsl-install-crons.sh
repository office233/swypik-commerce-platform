#!/bin/bash
# Instalează în WSL cron-urile de sistem care rulau pe VPS (adaptate local)
set -e
sudo mkdir -p /usr/local/bin /var/log

# 1. chain-health (adaptat: geth attach în container, la fel ca pe VPS)
sudo cp /mnt/e/vps-migrate/swypik-chain-health.sh /usr/local/bin/swypik-chain-health.sh
sudo cp /mnt/e/vps-migrate/swypik-peer-watchdog.sh /usr/local/bin/swypik-peer-watchdog.sh
sudo sed -i 's/\r//' /usr/local/bin/swypik-chain-health.sh /usr/local/bin/swypik-peer-watchdog.sh
sudo chmod +x /usr/local/bin/swypik-chain-health.sh /usr/local/bin/swypik-peer-watchdog.sh

# 2. script de pornire stack la boot
sudo tee /usr/local/bin/swypik-stack-up.sh >/dev/null <<'EOF'
#!/bin/bash
# Pornește tot stack-ul Swypik + multi-erp (idempotent)
sleep 10
cd /opt/swypik-chain
docker compose -f docker-compose.yml up -d
docker compose -f docker-compose.rpc.yml up -d
docker compose -f docker-compose.blockscout.yml up -d
cd /opt/swypik/app
docker compose -f infra/hetzner/docker-compose.prod.yml -f infra/hetzner/docker-compose.vps.yml \
  -f infra/hetzner/docker-compose.minio.yml --env-file infra/hetzner/.env.production \
  up -d postgres redis minio web-next cron-worker platform-api video-worker
cd /opt/multi-erp
docker compose -f docker-compose.multi.yml up -d
EOF
sudo chmod +x /usr/local/bin/swypik-stack-up.sh

# 3. crontab pentru dev
CRON_SECRET=$(grep -E '^CRON_SECRET=' /opt/swypik/app/infra/hetzner/.env.production | cut -d= -f2 | tr -d '"')
WEB=http://localhost:3005
crontab - <<EOF
# Swypik local (migrat de pe VPS 2026-08-01)
15 4 * * * curl -s -o /dev/null -H "x-cron-secret: ${CRON_SECRET}" ${WEB}/api/cron/daily-maintenance # daily-maintenance
*/5 * * * * /usr/local/bin/swypik-chain-health.sh # restart validator daca lantul ingheata
*/5 * * * * /usr/local/bin/swypik-peer-watchdog.sh # mentine nodul rpc conectat la validator
* * * * * for i in 0 1 2 3 4 5; do (sleep \$((i*10)); curl -s -o /dev/null -H "x-cron-secret: ${CRON_SECRET}" ${WEB}/api/cron/dispatch-tick) & done # dispatch-tick 10s
@reboot /usr/local/bin/swypik-stack-up.sh >> /var/log/swypik-stack-up.log 2>&1
EOF
crontab -l | grep -c '^[^#]' || true
sudo systemctl enable --now cron 2>/dev/null || true
echo CRONS_INSTALLED
