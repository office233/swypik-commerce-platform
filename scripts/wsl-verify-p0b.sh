#!/bin/bash
echo '== estimare rides (Satu Mare) =='
curl -s -X POST http://localhost:3005/api/rides/estimate -H 'Content-Type: application/json' \
  -d '{"city":"Satu Mare","pickupLat":47.792,"pickupLng":22.885,"dropLat":47.802,"dropLng":22.865,"vehicleClass":"economy"}' | head -c 400
echo
echo '== dispatch service =='
sudo systemctl is-active swypik-dispatch
sudo journalctl -u swypik-dispatch --since '3 min ago' --no-pager | grep -vE 'Digest|Status|pull' | tail -2
echo '== mediamtx API =='
MIP=$(docker inspect swypik-prod-mediamtx-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
curl -s -o /dev/null -w "api: %{http_code}\n" -m 5 "http://$MIP:9997/v3/paths/list"
