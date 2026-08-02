#!/bin/bash
# P0.3: dispatch-worker ca serviciu systemd în WSL (înlocuiește cron-ul zgomotos cu curl la 10s)
set -e
CRON_SECRET=$(grep -E '^CRON_SECRET=' /opt/swypik/app/infra/hetzner/.env.production | cut -d= -f2 | tr -d '"')
[ -n "$CRON_SECRET" ] || { echo "CRON_SECRET lipsă"; exit 1; }

sudo tee /etc/systemd/system/swypik-dispatch.service >/dev/null <<EOF
[Unit]
Description=Swypik dispatch worker (tick 10s)
After=docker.service network-online.target
Wants=network-online.target

[Service]
Environment=DISPATCH_TICK_URL=http://localhost:3005/api/cron/dispatch-tick
Environment=CRON_SECRET=${CRON_SECRET}
ExecStart=/usr/bin/docker run --rm --network host --name swypik-dispatch \
  -e DISPATCH_TICK_URL -e CRON_SECRET \
  -v /opt/swypik/app/scripts/dispatch-worker.mjs:/worker.mjs:ro \
  node:22-alpine node /worker.mjs
ExecStop=/usr/bin/docker stop swypik-dispatch
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# scot linia dispatch-tick din crontab (o preia serviciul)
crontab -l | grep -v 'dispatch-tick' | crontab -
sudo systemctl daemon-reload
sudo systemctl enable --now swypik-dispatch
sleep 12
sudo systemctl is-active swypik-dispatch
sudo journalctl -u swypik-dispatch --since '30 sec ago' --no-pager | tail -3
