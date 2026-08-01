#!/bin/bash
# Repara EMAIL_FROM fara ghilimele in .env.production (strica `source` in deploy.sh)
set -e
cd /opt/swypik/app/infra/hetzner
python3 - <<'PY'
import re
p = '.env.production'
s = open(p).read()
fixed = re.sub(r'^(EMAIL_FROM=)(?!")(.+)$', r'\1"\2"', s, flags=re.M)
if fixed != s:
    open(p, 'w').write(fixed)
    print('EMAIL_FROM: ghilimele adaugate')
else:
    print('EMAIL_FROM: deja ok')
PY
# Validare: source-ul trebuie sa treaca fara erori
bash -c 'set -a; source .env.production; echo ENV_OK'
