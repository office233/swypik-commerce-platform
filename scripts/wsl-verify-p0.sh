#!/bin/bash
echo '== mediamtx =='
MIP=$(docker inspect swypik-prod-mediamtx-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
curl -s -o /dev/null -w "api(:9997): %{http_code}\n" -m 5 "http://$MIP:9997/v3/config/global/get"
echo '== dispatch service =='
sudo systemctl is-active swypik-dispatch
sudo journalctl -u swypik-dispatch --since '2 min ago' --no-pager | tail -3
echo '== dispatch-tick manual =='
CS=$(grep -E '^CRON_SECRET=' /opt/swypik/app/infra/hetzner/.env.production | cut -d= -f2 | tr -d '"')
curl -s -H "x-cron-secret: $CS" -X POST http://localhost:3005/api/cron/dispatch-tick | head -c 200
echo
echo '== estimare Go (pricing zones) =='
curl -s -X POST http://localhost:3005/api/go/estimate -H 'Content-Type: application/json' \
  -d '{"city":"Satu Mare","pickup":{"lat":47.79,"lng":22.89},"dropoff":{"lat":47.80,"lng":22.87},"vehicleClass":"economy"}' | head -c 300
echo
