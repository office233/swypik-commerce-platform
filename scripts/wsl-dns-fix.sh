#!/bin/bash
sudo apt-get install -y -qq dnsutils >/dev/null 2>&1
echo '--- rezolutie actuala ---'
for h in swypik.com www.swypik.com; do
  printf '%s: %s\n' "$h" "$(dig +short $h @1.1.1.1 | tr '\n' ' ')"
done
echo '--- stergere record gresit swypik.com.swypik.com + overwrite apex ---'
cloudflared tunnel route dns --overwrite-dns swypik-home swypik.com
echo '--- retest in 20s ---'
sleep 20
printf 'apex: %s\n' "$(dig +short swypik.com @1.1.1.1 | tr '\n' ' ')"
curl -s -o /dev/null -w 'https://swypik.com/api/health -> %{http_code}\n' -m 15 https://swypik.com/api/health
