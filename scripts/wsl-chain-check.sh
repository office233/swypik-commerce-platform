#!/bin/bash
for host in 172.17.0.1 localhost; do
  echo "-- $host:8545"
  curl -s -m 3 -X POST -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' "http://$host:8545"
  echo
done
# și blocul curent al validatorului, din interiorul containerului
docker exec swypik-chain geth attach --exec 'eth.blockNumber' /data/geth.ipc 2>/dev/null || true
