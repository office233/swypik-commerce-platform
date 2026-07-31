#!/usr/bin/env bash
# Watchdog de peering: se asigură că nodul public e mereu conectat la
# validator. Necesar pentru că IP-urile containerelor se schimbă la restart,
# iar `--nodiscover` (corect, pentru un chain privat) împiedică descoperirea
# automată. Rulează din cron la 5 minute; e idempotent și silențios.
set -uo pipefail

RPC=swypik-chain-rpc
VAL=swypik-chain
LOG=/var/log/swypik-chain-peer.log

peers=$(docker exec "$RPC" geth attach --exec "admin.peers.length" /data/geth.ipc 2>/dev/null | tr -dc '0-9')
[ -n "$peers" ] && [ "$peers" -gt 0 ] && exit 0   # deja conectat

VIP=$(docker inspect "$VAL" -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' 2>/dev/null | awk '{print $1}')
[ -z "$VIP" ] && { echo "$(date '+%F %T') validator inaccesibil" >> "$LOG"; exit 1; }

ENODE=$(docker exec "$VAL" geth attach --exec "admin.nodeInfo.enode" /data/geth.ipc 2>/dev/null \
        | tr -d '"' | sed "s|@[0-9.]*:|@${VIP}:|" | sed 's|?discport=0||')
[ -z "$ENODE" ] && { echo "$(date '+%F %T') enode indisponibil" >> "$LOG"; exit 1; }

docker exec "$RPC" geth attach --exec "admin.addPeer(\"$ENODE\")" /data/geth.ipc >/dev/null 2>&1
sleep 5
after=$(docker exec "$RPC" geth attach --exec "admin.peers.length" /data/geth.ipc 2>/dev/null | tr -dc '0-9')
echo "$(date '+%F %T') repeer: $peers -> ${after:-?} ($ENODE)" >> "$LOG"

# actualizăm și static-nodes pentru următorul boot
printf '["%s"]\n' "$ENODE" > /opt/swypik-chain/rpc-data/geth/static-nodes.json 2>/dev/null || true
