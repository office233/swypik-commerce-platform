import json, urllib.request, sys
tx = sys.argv[1] if len(sys.argv) > 1 else "0x32ae634804f9efa80d6814b96830d46d74bf12af4c741646e2cb4f974e28a1f4"
def rpc(method, params):
    req = urllib.request.Request("http://172.17.0.1:8545",
        data=json.dumps({"jsonrpc":"2.0","method":method,"params":params,"id":1}).encode(),
        headers={"Content-Type":"application/json"})
    return json.load(urllib.request.urlopen(req))["result"]
t = rpc("eth_getTransactionByHash", [tx])
r = rpc("eth_getTransactionReceipt", [tx])
print(json.dumps({"from":t["from"],"to":t["to"],"value_wei":int(t["value"],16),
  "value_swyp":int(t["value"],16)/1e18,"input":t["input"][:80],"nonce":int(t["nonce"],16),
  "block":int(t["blockNumber"],16),"gasUsed":int(r["gasUsed"],16),"status":int(r["status"],16),
  "logs":len(r["logs"])}, indent=2))
b = rpc("eth_getBlockByNumber", [t["blockNumber"], False])
import datetime; print("timestamp:", datetime.datetime.utcfromtimestamp(int(b["timestamp"],16)).isoformat()+"Z")
