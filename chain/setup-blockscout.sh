#!/usr/bin/env bash
# Blockscout — explorer complet compatibil geth (blocuri, tranzacții, adrese).
# Un container backend + Postgres dedicat. ~700MB-1GB RAM.
# Înlocuiește Otterscan (care cere API-ul erigon ots_*, absent în geth).
set -euo pipefail
CHAIN_DIR=/opt/swypik-chain
cd "$CHAIN_DIR"

# oprim Otterscan (incompatibil cu geth)
docker rm -f swypik-explorer 2>/dev/null || true

if [ ! -f blockscout.env ]; then
	SECRET=$(head -c 48 /dev/urandom | base64 | tr -d '=+/')
	DBPW=$(head -c 24 /dev/urandom | base64 | tr -d '=+/')
	cat > blockscout.env <<EOF
SECRET_KEY_BASE=$SECRET
BLOCKSCOUT_DB_PASSWORD=$DBPW
EOF
	chmod 600 blockscout.env
fi
. ./blockscout.env

cat > docker-compose.blockscout.yml <<EOF
services:
	bs-postgres:
		image: postgres:15-alpine
		container_name: swypik-bs-postgres
		restart: unless-stopped
		environment:
			POSTGRES_USER: blockscout
			POSTGRES_PASSWORD: $BLOCKSCOUT_DB_PASSWORD
			POSTGRES_DB: blockscout
		volumes:
			- $CHAIN_DIR/bs-data:/var/lib/postgresql/data
		mem_limit: 256m
		logging: { options: { max-size: "10m", max-file: "2" } }

	blockscout:
		image: blockscout/blockscout:5.4.0
		container_name: swypik-blockscout
		restart: unless-stopped
		depends_on: [bs-postgres]
		command: sh -c "bin/blockscout eval \\"Elixir.Explorer.ReleaseTasks.create_and_migrate()\\" && bin/blockscout start"
		environment:
			ETHEREUM_JSONRPC_VARIANT: geth
			ETHEREUM_JSONRPC_HTTP_URL: http://172.17.0.1:8545
			ETHEREUM_JSONRPC_TRACE_URL: http://172.17.0.1:8545
			ETHEREUM_JSONRPC_WS_URL: ws://172.17.0.1:8546
			DATABASE_URL: postgresql://blockscout:$BLOCKSCOUT_DB_PASSWORD@bs-postgres:5432/blockscout
			SECRET_KEY_BASE: $SECRET_KEY_BASE
			ECTO_USE_SSL: "false"
			NETWORK: "Swypik Chain"
			SUBNETWORK: "Mainnet"
			COIN: SWYP
			COIN_NAME: SWYP
			CHAIN_ID: "643366"
			PORT: "4000"
			BLOCKSCOUT_HOST: scan.swypik.com
			BLOCKSCOUT_PROTOCOL: https
			DISABLE_EXCHANGE_RATES: "true"
			INDEXER_DISABLE_INTERNAL_TRANSACTIONS_FETCHER: "true"
			INDEXER_DISABLE_PENDING_TRANSACTIONS_FETCHER: "false"
			POOL_SIZE: "10"
			POOL_SIZE_API: "5"
		ports:
			- "172.17.0.1:5100:4000"
		mem_limit: 1g
		logging: { options: { max-size: "20m", max-file: "3" } }
EOF

docker compose -f docker-compose.blockscout.yml up -d
echo "Aștept migrarea DB + pornirea (poate dura 1-2 min)..."
for i in $(seq 1 24); do
	sleep 10
	CODE=$(curl -s -o /dev/null -w '%{http_code}' http://172.17.0.1:5100/ || true)
	echo "  try $i: HTTP $CODE"
	[ "$CODE" = "200" ] && break
done
docker ps --filter name=swypik-blockscout --format '{{.Names}} {{.Status}}'