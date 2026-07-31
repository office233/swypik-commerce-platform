#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  ARHITECTURĂ SIGURĂ: separarea rolurilor (standard în producție)
# ═══════════════════════════════════════════════════════════════════════════
#  Problema: geth interzice (corect!) deblocarea conturilor când HTTP-RPC e
#  pornit — un singur nod nu poate fi în același timp "semnatar cu chei" și
#  "endpoint public".
#
#  Soluția standard:
#   • swypik-chain     = VALIDATOR (sealer). Are cheile, semnează blocuri,
//                        FĂRĂ HTTP/WS. Comunică doar prin P2P.
#   • swypik-chain-rpc = NOD PUBLIC. Zero chei, doar citește lanțul și expune
#                        HTTP/WS pentru app, explorer și utilizatori.
#                        Chiar dacă e compromis, nu poate semna nimic.
set -euo pipefail

CHAIN_DIR=/opt/swypik-chain
cd "$CHAIN_DIR"
. ./accounts.env
GETH_IMG=ethereum/client-go:v1.13.15

# ── 1. Validatorul: fără HTTP, doar semnare ────────────────────────────────
python3 - <<'PY'
p = 'docker-compose.yml'
src = open(p).read()
import re
# scoatem toate flag-urile HTTP/WS din validator
for flag in [
    '--http --http.addr 0.0.0.0 --http.port 8545 --http.vhosts \'*\'',
    '--http.corsdomain \'*\' --http.api eth,net,web3',
    '--ws --ws.addr 0.0.0.0 --ws.port 8546 --ws.origins \'*\' --ws.api eth,net,web3',
]:
    src = src.replace(flag, '')
# scoatem maparea de porturi (nu mai expune nimic)
src = re.sub(r'\n\s*ports:\n(\s*-\s*"[^"]*"\n)+', '\n', src)
# validatorul trebuie să accepte peers (nodul public se conectează la el)
src = src.replace('--nodiscover --maxpeers 25', '--nodiscover --maxpeers 25 --netrestrict 172.16.0.0/12')
open(p, 'w').write(src)
print('validator: HTTP/WS scoase, porturi inchise')
PY

# ── 2. Nodul public: fără chei, cu HTTP ────────────────────────────────────
mkdir -p rpc-data
if [ ! -d rpc-data/geth/chaindata ]; then
  docker run --rm -v "$CHAIN_DIR/rpc-data:/data" -v "$CHAIN_DIR/genesis.json:/genesis.json:ro" \
    $GETH_IMG init --datadir /data /genesis.json >/dev/null 2>&1
  echo "nod public initializat de la genesis"
fi

cat > docker-compose.rpc.yml <<EOF
networks:
  chainnet:
    name: swypik-chain_default
    external: true
  appnet:
    name: swypik-prod_default
    external: true

services:
  swypik-chain-rpc:
    image: $GETH_IMG
    container_name: swypik-chain-rpc
    restart: unless-stopped
    command: >
      --datadir /data
      --networkid 643366
      --syncmode full --gcmode archive
      --http --http.addr 0.0.0.0 --http.port 8545 --http.vhosts '*'
      --http.corsdomain '*' --http.api eth,net,web3
      --ws --ws.addr 0.0.0.0 --ws.port 8546 --ws.origins '*' --ws.api eth,net,web3
      --nodiscover --maxpeers 25
      --bootnodes BOOTNODE_PLACEHOLDER
      --cache 256
    volumes:
      - $CHAIN_DIR/rpc-data:/data
    ports:
      - "172.17.0.1:8545:8545"
      - "172.17.0.1:8546:8546"
    networks: [chainnet, appnet]
    mem_limit: 1g
    logging: { options: { max-size: "20m", max-file: "3" } }
EOF

# ── 3. Pornim validatorul și aflăm enode-ul lui ────────────────────────────
docker compose up -d 2>&1 | tail -1
sleep 12
ENODE=$(docker logs swypik-chain 2>&1 | grep -oE 'enode://[a-f0-9]{128}@[0-9.]+:30303' | tail -1)
if [ -z "$ENODE" ]; then echo "EROARE: nu găsesc enode-ul validatorului"; docker logs swypik-chain --tail 5; exit 1; fi
# IP-ul containerului validator în rețeaua chainnet
VIP=$(docker inspect swypik-chain -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' | awk '{print $1}')
ENODE_FIXED=$(echo "$ENODE" | sed "s|@[0-9.]*:30303|@${VIP}:30303|")
echo "validator enode: $ENODE_FIXED"
sed -i "s|BOOTNODE_PLACEHOLDER|$ENODE_FIXED|" docker-compose.rpc.yml

# ── 4. Pornim nodul public ────────────────────────────────────────────────
docker compose -f docker-compose.rpc.yml up -d 2>&1 | tail -1
echo "Aștept sincronizarea nodului public..."
for i in $(seq 1 15); do
  sleep 8
  B=$(curl -s -X POST -H 'Content-Type: application/json' \
      --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
      http://172.17.0.1:8545 2>/dev/null | grep -oE '0x[0-9a-f]+' | head -1)
  P=$(curl -s -X POST -H 'Content-Type: application/json' \
      --data '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}' \
      http://172.17.0.1:8545 2>/dev/null | grep -oE '0x[0-9a-f]+' | head -1)
  echo "  try $i: block=$B peers=$P"
  [ -n "$B" ] && [ "$B" != "0x0" ] && break
done

echo ""
echo "=== VERIFICARE FINALĂ ==="
echo "-- nodul public NU are conturi (trebuie []) --"
curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_accounts","params":[],"id":1}' http://172.17.0.1:8545
echo ""
docker ps --filter name=swypik-chain --format '{{.Names}}\t{{.Status}}'
