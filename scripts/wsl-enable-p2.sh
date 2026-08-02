#!/bin/bash
# P2: activare push (VAPID) + DM în .env.production local WSL.
# Cheile VAPID vin din /tmp/vapid.json (copiat de pe Windows, șters la final).
set -e
ENV=/opt/swypik/app/infra/hetzner/.env.production
PUB=$(python3 -c "import json;print(json.load(open('/tmp/vapid.json'))['publicKey'])")
PRIV=$(python3 -c "import json;print(json.load(open('/tmp/vapid.json'))['privateKey'])")

set_var() { # set_var KEY VALUE
  if grep -q "^$1=" "$ENV"; then
    sed -i "s|^$1=.*|$1=$2|" "$ENV"
  else
    echo "$1=$2" >> "$ENV"
  fi
}

set_var VAPID_PUBLIC_KEY "$PUB"
set_var VAPID_PRIVATE_KEY "$PRIV"
set_var VAPID_SUBJECT "mailto:contact@swypik.com"
set_var FEATURE_PUSH_NOTIFICATIONS true
set_var NEXT_PUBLIC_FEATURE_PUSH_NOTIFICATIONS true
set_var FEATURE_DM true
set_var NEXT_PUBLIC_FEATURE_DM true

grep -cE '^(VAPID|FEATURE_PUSH|NEXT_PUBLIC_FEATURE_PUSH|FEATURE_DM|NEXT_PUBLIC_FEATURE_DM)' "$ENV"
rm -f /tmp/vapid.json
echo P2_ENV_SET
