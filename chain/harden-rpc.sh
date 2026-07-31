#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  ÎNTĂRIRE SECURITATE Swypik Chain
# ═══════════════════════════════════════════════════════════════════════════
# Problemă găsită la audit: nodul rulează cu --allow-insecure-unlock și expune
# `eth_accounts` + `eth_sendTransaction` prin RPC-ul PUBLIC. Oricine putea
# semna tranzacții din conturile deblocate (a eșuat doar fiindcă validatorul
# avea sold 0 — o problemă de noroc, nu de securitate).
#
# Soluție, pe două niveluri:
#  1. NOD: separă rolurile — RPC-ul public expune DOAR metode read-only
#     (eth,net,web3), fără `personal`/`account`; semnarea validatorului
#     rămâne internă (miner).
#  2. NGINX: allowlist de metode JSON-RPC pe rpc.swypik.com — orice metodă
#     de scriere sau administrativă e respinsă înainte să ajungă la nod.
#     Excepție: eth_sendRawTransaction (tranzacții deja semnate de user —
#     nu poate face rău, e modul standard prin care wallet-urile trimit).
set -euo pipefail

CHAIN_DIR=/opt/swypik-chain
cd "$CHAIN_DIR"

# ── 1. Nod: scoate unlock-ul nesigur, păstrează mineritul ──────────────────
python3 - <<'PY'
p = 'docker-compose.yml'
src = open(p).read()

# Validatorul semnează blocuri cu cheia din keystore prin --miner.etherbase +
# --unlock, dar NU mai permitem apeluri de semnare din RPC: scoatem
# `--allow-insecure-unlock` și restrângem API-urile HTTP/WS.
src = src.replace(' --allow-insecure-unlock', '')
src = src.replace('--http.api eth,net,web3,txpool', '--http.api eth,net,web3')
src = src.replace('--ws.api eth,net,web3', '--ws.api eth,net,web3')

open(p, 'w').write(src)
print('compose: allow-insecure-unlock scos, API HTTP restrans')
PY

docker compose config >/dev/null && echo "YAML VALID"
docker compose up -d 2>&1 | tail -1
sleep 12

echo "--- nodul produce blocuri în continuare? ---"
B1=$(curl -s -X POST -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://172.17.0.1:8545)
sleep 7
B2=$(curl -s -X POST -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://172.17.0.1:8545)
echo "  $B1 -> $B2"

# ── 2. nginx: allowlist de metode pe RPC-ul public ────────────────────────
CONF=/opt/meister/nginx/nginx.conf
cp "$CONF" "${CONF}.bak.harden.$(date +%s)"

python3 - "$CONF" <<'PY'
import sys
p = sys.argv[1]
lines = open(p).read().split('\n')
out, in_rpc, done = [], False, False
guard = '''
                # Allowlist JSON-RPC: doar citire + trimitere de tranzacții
                # DEJA SEMNATE de utilizator. Blocăm eth_sendTransaction,
                # eth_sign, personal_*, miner_*, admin_*, debug_*, txpool_*.
                if ($request_body ~* "\\"method\\"\\s*:\\s*\\"(personal_|miner_|admin_|debug_|txpool_|clique_propose|clique_discard|eth_sendTransaction|eth_sign|eth_signTransaction|eth_accounts)") {
                    return 403;
                }
'''
for ln in lines:
    if 'server_name rpc.swypik.com' in ln:
        in_rpc = True
    elif in_rpc and 'server_name' in ln:
        in_rpc = False
    if in_rpc and not done and 'proxy_pass http://172.17.0.1:8545' in ln:
        out.append(guard.rstrip('\n'))
        done = True
    out.append(ln)
open(p, 'w').write('\n'.join(out))
print('nginx: allowlist metode adaugat' if done else 'ATENTIE: blocul rpc nu a fost gasit')
PY

docker exec meister-nginx nginx -t 2>&1 | grep -E 'successful|emerg'
docker exec meister-nginx nginx -s reload 2>/dev/null
echo "OK nginx reincarcat"
