#!/bin/bash
# Unde merge gas-ul pe Swypik Chain?
R=http://172.17.0.1:8545
call() { curl -s -X POST -H 'Content-Type: application/json' -d "{\"jsonrpc\":\"2.0\",\"method\":\"$1\",\"params\":$2,\"id\":1}" $R; }
source /opt/swypik-chain/accounts.env

bal() { call eth_getBalance "[\"$1\",\"latest\"]" | python3 -c 'import sys,json;print(f"{int(json.load(sys.stdin)[\"result\"],16)/10**18:.9f}"); '; }

echo "=== TRANZACTIA DE AZI: cine a platit, cine a primit ==="
call eth_getTransactionReceipt '["0x32ae634804f9efa80d6814b96830d46d74bf12af4c741646e2cb4f974e28a1f4"]' | python3 -c '
import sys,json
r=json.load(sys.stdin)["result"]
g=int(r["gasUsed"],16); p=int(r["effectiveGasPrice"],16)
print("gasUsed:",g)
print("gasPrice:",p/10**9,"gwei")
print("TAXA TOTALA:",g*p/10**18,"SWYP")
'

echo ""
echo "=== SOLD VALIDATOR (aici ajunge gas-ul) ==="
echo "$VALIDATOR = $(bal $VALIDATOR) SWYP"

echo ""
echo "=== BASEFEE curent (EIP-1559 -> se ARDE, nu merge la nimeni) ==="
call eth_getBlockByNumber '["latest", false]' | python3 -c '
import sys,json
b=json.load(sys.stdin)["result"]
bf=b.get("baseFeePerGas")
print("baseFeePerGas:", int(bf,16)/10**9 if bf else "ABSENT (fara EIP-1559)", "gwei")
print("gasLimit:", int(b["gasLimit"],16))
'

echo ""
echo "=== GENESIS: EIP-1559 activ? (londonBlock) ==="
python3 -c "
import json
c=json.load(open('/opt/swypik-chain/genesis.json'))['config']
for k in ['londonBlock','berlinBlock','shanghaiTime','clique']:
    if k in c: print(k,'=',c[k])
"
