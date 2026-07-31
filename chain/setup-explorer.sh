#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  Explorer public + RPC public pentru Swypik Chain
# ═══════════════════════════════════════════════════════════════════════════
#  • Otterscan — explorer EVM ușor (~50MB RAM), citește direct din geth
#  • scan.swypik.com → explorer (oricine vede blocuri/tranzacții/adrese)
#  • rpc.swypik.com  → nodul public (MetaMask, dApps, verificare independentă)
#
#  Otterscan cere API-ul `ots_*` din geth (erigon-style). geth-ul standard nu
#  îl are, deci folosim varianta "blockscout-lite": Otterscan funcționează în
#  mod degradat. Alternativă mai sigură: expunem RPC public + o pagină proprie
#  de explorer în aplicație. Aici pornim Otterscan și verificăm.
set -euo pipefail

CHAIN_DIR=/opt/swypik-chain
cd "$CHAIN_DIR"

cat > docker-compose.explorer.yml <<'EOF'
services:
  swypik-explorer:
    image: otterscan/otterscan:v2.5.0
    container_name: swypik-explorer
    restart: unless-stopped
    environment:
      ERIGON_URL: "https://rpc.swypik.com"
      OTTERSCAN_CONFIG: >
        {"erigonURL":"https://rpc.swypik.com",
         "chainInfo":{"name":"Swypik Chain","faucets":[],
         "nativeCurrency":{"name":"Swypik","symbol":"SWYP","decimals":18}}}
    ports:
      - "127.0.0.1:5100:80"
    mem_limit: 256m
    logging: { options: { max-size: "10m", max-file: "2" } }
EOF

docker compose -f docker-compose.explorer.yml up -d
sleep 5
echo "explorer local: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5100/)"
docker ps --filter name=swypik-explorer --format '{{.Names}} {{.Status}}'
