#!/usr/bin/env bash
# Extrage cheia privată a trezoreriei REWARDS din keystore-ul geth și o scrie
# în .env.production al aplicației (SWYP_TREASURY_REWARDS_PK), ca backend-ul
# să poată semna transferurile bridge-ului.
#
# Cheia NU se afișează pe ecran și nu părăsește serverul.
set -euo pipefail

CHAIN_DIR=/opt/swypik-chain
APP_ENV=/opt/swypik/app/infra/hetzner/.env.production
. "$CHAIN_DIR/accounts.env"
PASSWORD=$(cat "$CHAIN_DIR/password.txt")

# fișierul keystore al adresei REWARDS (fără 0x, lowercase)
ADDR_NO0X=$(echo "${T_REWARDS#0x}" | tr 'A-F' 'a-f')
KEYFILE=$(ls "$CHAIN_DIR"/data/keystore/*"$ADDR_NO0X" 2>/dev/null | head -1)
if [ -z "$KEYFILE" ]; then
  echo "EROARE: nu găsesc keystore pentru $T_REWARDS"; exit 1
fi

# decriptare cu web3 (python) — nu expunem cheia în output
PK=$(python3 - "$KEYFILE" "$PASSWORD" <<'PY'
import json, sys
from eth_account import Account
keyfile, pw = sys.argv[1], sys.argv[2]
with open(keyfile) as f:
    enc = json.load(f)
print("0x" + Account.decrypt(enc, pw).hex())
PY
)

if [ -z "$PK" ]; then echo "EROARE: decriptare eșuată"; exit 1; fi

# scrie/actualizează în .env.production (fără să tipărim valoarea)
if grep -q '^SWYP_TREASURY_REWARDS_PK=' "$APP_ENV" 2>/dev/null; then
  sed -i "s|^SWYP_TREASURY_REWARDS_PK=.*|SWYP_TREASURY_REWARDS_PK=$PK|" "$APP_ENV"
else
  echo "SWYP_TREASURY_REWARDS_PK=$PK" >> "$APP_ENV"
fi
grep -q '^SWYP_CHAIN_RPC=' "$APP_ENV" || echo "SWYP_CHAIN_RPC=http://swypik-chain:8545" >> "$APP_ENV"

chmod 600 "$APP_ENV"
echo "OK: SWYP_TREASURY_REWARDS_PK scris in .env.production (lungime: ${#PK})"
echo "Adresa trezoreriei: $T_REWARDS"
