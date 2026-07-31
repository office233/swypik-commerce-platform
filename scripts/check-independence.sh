#!/bin/bash
# Dovada ca Swypik Chain e o retea independenta, nu Ethereum.
R=http://172.17.0.1:8545
call() { curl -s -X POST -H 'Content-Type: application/json' -d "{\"jsonrpc\":\"2.0\",\"method\":\"$1\",\"params\":$2,\"id\":1}" $R; }

echo "=== CHAIN ID (Ethereum = 1) ==="
call eth_chainId '[]'; echo
echo "=== NETWORK ID (Ethereum = 1) ==="
call net_version '[]'; echo
echo "=== CLIENT ==="
call web3_clientVersion '[]'; echo
echo "=== BLOCUL 0 (genesis) - hash-ul Ethereum e 0xd4e56740...cb8fa3 ==="
call eth_getBlockByNumber '["0x0", false]' | python3 -c 'import sys,json;b=json.load(sys.stdin)["result"];print("hash:",b["hash"]);print("extraData len:",len(b["extraData"]),"(clique PoA)");print("difficulty:",b["difficulty"])'
echo "=== PEERS (cu cine vorbim) ==="
call net_peerCount '[]'; echo
echo "=== CONSENS: blocul curent are miner/validator ==="
call eth_getBlockByNumber '["latest", false]' | python3 -c 'import sys,json;b=json.load(sys.stdin)["result"];print("nr:",int(b["number"],16));print("miner:",b["miner"]);print("difficulty:",b["difficulty"],"(2=in-turn clique, NU proof-of-work)")'
echo "=== BOOTNODES ETHEREUM configurate? ==="
docker inspect swypik-chain --format '{{range .Args}}{{println .}}{{end}}' | grep -iE "bootnode|mainnet|goerli|sepolia|holesky" || echo "NICIUNUL - retea izolata"
docker inspect swypik-chain --format '{{range .Args}}{{println .}}{{end}}' | grep -iE "nodiscover|networkid"
