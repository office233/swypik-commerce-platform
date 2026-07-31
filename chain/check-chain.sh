#!/usr/bin/env bash
# Verificare rapidă a stării Swypik Chain (rulează pe VPS).
set -u
rpc() {
  curl -s -X POST -H 'Content-Type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"$1\",\"params\":$2,\"id\":1}" \
    http://127.0.0.1:8545
}
. /opt/swypik-chain/accounts.env

echo "=== chainId ===";      rpc eth_chainId '[]'; echo ""
echo "=== blockNumber ==="; rpc eth_blockNumber '[]'; echo ""
echo "=== sold trezorerie REWARDS ==="; rpc eth_getBalance "[\"$T_REWARDS\",\"latest\"]"; echo ""
echo "=== ultimul bloc ==="; rpc eth_getBlockByNumber '["latest",false]' | head -c 400; echo ""
echo "=== container ==="; docker ps --filter name=swypik-chain --format '{{.Names}} {{.Status}}'
