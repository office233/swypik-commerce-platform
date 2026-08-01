#!/bin/bash
# Adauga SWYP_WALLET_KEY (cheia de criptare a portofelelor on-chain) in env
# si reporneste web-next. Sigur: swyp_chain_wallets e gol, nicio cheie veche
# de decriptat. Cheia se salveaza si in /root/.swyp_wallet_key (600).
set -e
ENVF=/opt/swypik/app/infra/hetzner/.env.production

if grep -q '^SWYP_WALLET_KEY=' "$ENVF"; then
  echo "SWYP_WALLET_KEY exista deja in env"
else
  KEY=$(openssl rand -hex 32)
  echo "SWYP_WALLET_KEY=$KEY" >> "$ENVF"
  printf '%s' "$KEY" > /root/.swyp_wallet_key
  chmod 600 /root/.swyp_wallet_key
  echo "SWYP_WALLET_KEY generat si adaugat (copie in /root/.swyp_wallet_key)"
fi

cd /opt/swypik/app
docker compose -f infra/hetzner/docker-compose.prod.yml \
  -f infra/hetzner/docker-compose.vps.yml \
  -f infra/hetzner/docker-compose.minio.yml \
  --env-file "$ENVF" up -d web-next 2>&1 | tail -2

sleep 12
docker exec swypik-prod-web-next-1 sh -c 'test -n "$SWYP_WALLET_KEY" && echo "CONTAINER: SWYP_WALLET_KEY=SET" || echo "CONTAINER: LIPSESTE INCA"'
curl -s -o /dev/null -w 'health: %{http_code}\n' -m 20 https://swypik.com/api/health
