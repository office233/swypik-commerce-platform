#!/bin/sh
# Test JSON-RPC: direct la geth si prin rpc.swypik.com
BODY='{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
echo "== direct geth (172.17.0.1:8545):"
curl -s -X POST -H 'Content-Type: application/json' -d "$BODY" http://172.17.0.1:8545
echo
echo "== public https://rpc.swypik.com :"
curl -s -X POST -H 'Content-Type: application/json' -d "$BODY" https://rpc.swypik.com/
echo
