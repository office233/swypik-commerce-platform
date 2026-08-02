#!/bin/bash
# Audit hardcodări infra/secrete — Faza 1 (rulează: sed 's/\r//' scripts/wsl-audit-hardcode.sh | bash)
cd /opt/swypik/app || exit 1
echo "=== IP VPS mort / secrete în cod (app, lib, components, services, workers, infra scripts) ==="
grep -rnE '178\.105\.46\.66|sk_live_|whsec_[A-Za-z0-9]|AIzaSy[A-Za-z0-9_-]{10}' app lib components services workers scripts infra 2>/dev/null | grep -v node_modules | grep -v '.env.production'
echo "=== URL-uri absolute hardcodate suspecte (non-swypik.com extern ok) ==="
grep -rnE '"https?://(localhost|127\.0\.0\.1)[^"]*"' app lib components 2>/dev/null | grep -v node_modules | grep -vE 'example|test|spec' | head -30
echo "=== process.env fallback-uri periculoase (|| \"secret/parola\") ==="
grep -rnE 'process\.env\.[A-Z_]+ *\|\| *"[^"]{8,}"' lib app 2>/dev/null | grep -v node_modules | grep -vE 'http|localhost|utf|json|application' | head -30
