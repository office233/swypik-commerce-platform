#!/usr/bin/env bash
# .env.production avea linii orfane (text fara "=") ramase dintr-o editare
# anterioara — `source` incerca sa le execute ca si comenzi. Le comentam.
set -euo pipefail
ENVF=/opt/swypik/app/infra/hetzner/.env.production
cp "$ENVF" "/opt/meister-backups/env.production.bak.$(date +%Y%m%d_%H%M%S)"

python3 - "$ENVF" <<'PY'
import re, sys
path = sys.argv[1]
out, fixed = [], []
for i, line in enumerate(open(path, encoding='utf-8'), 1):
    raw = line.rstrip('\n')
    s = raw.strip()
    if s and not s.startswith('#') and not re.match(r'^[A-Za-z_][A-Za-z0-9_]*=', s):
        out.append('# ORFAN (comentat automat): ' + raw)
        fixed.append(f'{i}: {raw[:40]}')
    else:
        out.append(raw)
open(path, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('linii orfane comentate:', len(fixed))
for f in fixed: print('  ', f)
PY

if ( set -a; . "$ENVF"; set +a ) 2>/dev/null; then
    echo "OK: env-ul se poate sursa"
else
    echo "EROARE ramasa:" >&2
    ( set -a; . "$ENVF"; set +a ) 2>&1 | head -5
    exit 1
fi
