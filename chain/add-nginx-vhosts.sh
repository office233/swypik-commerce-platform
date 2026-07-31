#!/usr/bin/env bash
# Adaugă vhost-urile scan.swypik.com și rpc.swypik.com în nginx-ul existent.
# Idempotent: nu dublează dacă blocurile există deja. Face backup înainte.
set -euo pipefail

CONF=/opt/meister/nginx/nginx.conf
HOST_IP=172.17.0.1   # gateway docker0 — de aici nginx (în container) ajunge la serviciile de pe host

if grep -q "scan.swypik.com" "$CONF"; then
  echo "SKIP: vhost-urile există deja"
  exit 0
fi

cp "$CONF" "${CONF}.bak.$(date +%s)"

python3 - "$CONF" "$HOST_IP" <<'PY'
import sys
conf_path, host_ip = sys.argv[1], sys.argv[2]
src = open(conf_path).read()

block = f'''
        # ── Swypik Chain: explorer public ──────────────────────────────
        server {{
            listen 443 ssl;
            http2 on;
            server_name scan.swypik.com;

            ssl_certificate     /etc/cloudflare-origin/swypik-origin.pem;
            ssl_certificate_key /etc/cloudflare-origin/swypik-origin.key;
            ssl_protocols       TLSv1.2 TLSv1.3;
            ssl_ciphers         HIGH:!aNULL:!MD5;

            location / {{
                proxy_pass http://{host_ip}:5100;
                proxy_set_header Host $host;
                proxy_set_header X-Real-IP $remote_addr;
                proxy_set_header X-Forwarded-Proto https;
            }}
        }}

        # ── Swypik Chain: RPC public (wallets/dApps) ───────────────────
        server {{
            listen 443 ssl;
            http2 on;
            server_name rpc.swypik.com;

            ssl_certificate     /etc/cloudflare-origin/swypik-origin.pem;
            ssl_certificate_key /etc/cloudflare-origin/swypik-origin.key;
            ssl_protocols       TLSv1.2 TLSv1.3;
            ssl_ciphers         HIGH:!aNULL:!MD5;

            client_max_body_size 1m;

            location / {{
                add_header Access-Control-Allow-Origin  "*" always;
                add_header Access-Control-Allow-Methods "POST, GET, OPTIONS" always;
                add_header Access-Control-Allow-Headers "Content-Type" always;
                if ($request_method = OPTIONS) {{ return 204; }}

                proxy_pass http://{host_ip}:8545;
                proxy_set_header Host $host;
                proxy_set_header X-Real-IP $remote_addr;
                proxy_read_timeout 30s;
            }}
        }}
'''

idx = src.rstrip().rfind('}')
out = src[:idx] + block + '\n' + src[idx:]
open(conf_path, 'w').write(out)
print("vhost-uri adaugate")
PY

docker exec meister-nginx nginx -t && docker exec meister-nginx nginx -s reload
echo "OK nginx reincarcat"
