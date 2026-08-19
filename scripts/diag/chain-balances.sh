#!/bin/bash
# Solduri on-chain trezorerii Swypik Chain
source /opt/swypik-chain/accounts.env
for name in VALIDATOR T_REWARDS T_ECOSYSTEM T_COMPANY T_TEAM T_RESERVE; do
  addr="${!name}"
  hex=$(curl -s -X POST -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["'"$addr"'","latest"],"id":1}' \
    http://127.0.0.1:8545 | python3 -c 'import sys,json;print(json.load(sys.stdin)["result"])')
  swyp=$(python3 -c "print(int('$hex',16)/10**18)")
  echo "$name $addr = $swyp SWYP"
done
