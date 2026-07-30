#!/bin/bash
SEC=$(grep '^CRON_SECRET=' /opt/swypik/app/infra/hetzner/.env.production | cut -d= -f2)
echo "-- cron tick cu secret:"
curl -s -H "x-cron-secret: $SEC" https://swypik.com/api/cron/dispatch-tick | head -c 200; echo
echo "-- /ro/go redirect target + final:"
curl -s -o /dev/null -w '%{http_code} -> %{url_effective}\n' -L https://swypik.com/ro/go
echo "-- continut pagina go:"
curl -s -L https://swypik.com/ro/go | grep -oE 'Swypik Go|Unde mergi|leaflet|login|Autentific' | sort | uniq -c | head
echo "-- push public key endpoint (env check in container):"
docker exec swypik-prod-web-next-1 sh -c 'echo VAPID=${VAPID_PUBLIC_KEY:0:10}... CRON=${CRON_SECRET:0:6}...'
