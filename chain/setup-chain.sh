#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  SWYPIK CHAIN — bootstrap: blockchain EVM real (geth, consens Clique PoA)
# ═══════════════════════════════════════════════════════════════════════════
#  • geth = implementarea oficială Ethereum (github.com/ethereum/go-ethereum)
#  • Chain ID 643366 (unic, derivat din contul Swypik Storage Box)
#  • SWYP = moneda NATIVĂ a chainului (ca ETH pe Ethereum), 18 zecimale
#  • Supply fix 10 mld SWYP pre-mintat la genesis în 5 conturi de trezorerie
#  • Blocuri la 5 secunde, semnate de validatorul Swypik (PoA)
#  • Gas-ul plătit de utilizatori ajunge la validator (= platforma)
#
#  Rulare (o singură dată, pe VPS):  bash setup-chain.sh
set -euo pipefail

CHAIN_DIR=/opt/swypik-chain
CHAIN_ID=643366
GETH_IMG=ethereum/client-go:v1.13.15   # ultima serie cu Clique complet funcțional

mkdir -p "$CHAIN_DIR"/{data,keystore-init}
cd "$CHAIN_DIR"

# ── 1. Parola keystore (generată local, nu părăsește serverul) ─────────────
if [ ! -f password.txt ]; then
  head -c 32 /dev/urandom | base64 | tr -d '=+/' | head -c 40 > password.txt
  chmod 600 password.txt
  echo "✓ parola keystore generată"
fi

# ── 2. Conturi: 1 validator + 5 trezorerii ─────────────────────────────────
new_account() {
  docker run --rm -v "$CHAIN_DIR/keystore-init:/ks" -v "$CHAIN_DIR/password.txt:/pw:ro" \
    $GETH_IMG account new --keystore /ks --password /pw 2>/dev/null \
    | grep -oE '0x[0-9a-fA-F]{40}' | head -1
}

if [ ! -f accounts.env ]; then
  echo "Generez conturile (validator + 5 trezorerii)..."
  VALIDATOR=$(new_account)
  T_REWARDS=$(new_account)
  T_ECOSYSTEM=$(new_account)
  T_COMPANY=$(new_account)
  T_TEAM=$(new_account)
  T_RESERVE=$(new_account)
  cat > accounts.env <<EOF
VALIDATOR=$VALIDATOR
T_REWARDS=$T_REWARDS
T_ECOSYSTEM=$T_ECOSYSTEM
T_COMPANY=$T_COMPANY
T_TEAM=$T_TEAM
T_RESERVE=$T_RESERVE
EOF
  chmod 600 accounts.env
fi
. ./accounts.env
echo "Validator:  $VALIDATOR"
echo "Rewards:    $T_REWARDS"

# ── 3. Genesis: supply fix 10 mld SWYP (55/15/15/10/5), Clique 5s ──────────
# 1 SWYP = 1e18 subunități (ca ETH→wei).
if [ ! -f genesis.json ]; then
  STRIPPED=${VALIDATOR#0x}
  EXTRADATA="0x$(printf '0%.0s' {1..64})${STRIPPED}$(printf '0%.0s' {1..130})"
  cat > genesis.json <<EOF
{
  "config": {
    "chainId": $CHAIN_ID,
    "homesteadBlock": 0, "eip150Block": 0, "eip155Block": 0, "eip158Block": 0,
    "byzantiumBlock": 0, "constantinopleBlock": 0, "petersburgBlock": 0,
    "istanbulBlock": 0, "berlinBlock": 0, "londonBlock": 0,
    "clique": { "period": 5, "epoch": 30000 }
  },
  "difficulty": "1",
  "gasLimit": "30000000",
  "extradata": "$EXTRADATA",
  "alloc": {
    "$T_REWARDS":   { "balance": "5500000000000000000000000000" },
    "$T_ECOSYSTEM": { "balance": "1500000000000000000000000000" },
    "$T_COMPANY":   { "balance": "1500000000000000000000000000" },
    "$T_TEAM":      { "balance": "1000000000000000000000000000" },
    "$T_RESERVE":   { "balance":  "500000000000000000000000000" }
  }
}
EOF
  echo "✓ genesis.json scris (supply fix: 10.000.000.000 SWYP)"
fi

# ── 4. Inițializare + pornire nod ──────────────────────────────────────────
if [ ! -d data/geth/chaindata ]; then
  cp -r keystore-init data/keystore
  docker run --rm -v "$CHAIN_DIR/data:/data" -v "$CHAIN_DIR/genesis.json:/genesis.json:ro" \
    $GETH_IMG init --datadir /data /genesis.json
  echo "✓ chain inițializat de la genesis"
fi

cat > docker-compose.yml <<EOF
services:
  swypik-chain:
    image: $GETH_IMG
    container_name: swypik-chain
    restart: unless-stopped
    command: >
      --datadir /data
      --networkid $CHAIN_ID
      --syncmode full --gcmode archive
      --unlock $VALIDATOR --password /password.txt --allow-insecure-unlock
      --mine --miner.etherbase $VALIDATOR
      --http --http.addr 0.0.0.0 --http.port 8545 --http.vhosts '*'
      --http.corsdomain '*' --http.api eth,net,web3,txpool
      --ws --ws.addr 0.0.0.0 --ws.port 8546 --ws.origins '*' --ws.api eth,net,web3
      --nodiscover --maxpeers 25
      --cache 256
    volumes:
      - $CHAIN_DIR/data:/data
      - $CHAIN_DIR/password.txt:/password.txt:ro
    ports:
      - "127.0.0.1:8545:8545"
      - "127.0.0.1:8546:8546"
    mem_limit: 1g
    logging: { options: { max-size: "20m", max-file: "3" } }
EOF

docker compose up -d
sleep 8
echo ""
echo "=== VERIFICARE ==="
BLOCK=\$(curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://127.0.0.1:8545 || true)
echo "blockNumber: \$BLOCK"
curl -s -X POST -H 'Content-Type: application/json' \
  --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBalance\",\"params\":[\"$T_REWARDS\",\"latest\"],\"id\":1}" \
  http://127.0.0.1:8545
echo ""
echo "✓ Swypik Chain rulează. Chain ID: $CHAIN_ID"
