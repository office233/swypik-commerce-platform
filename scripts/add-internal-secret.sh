#!/usr/bin/env bash
# Adauga INTERNAL_SECRET in .env.production daca lipseste (folosit de
# /api/internal/moderation/* — ERP-ul trimite acelasi secret in header x-internal).
# Afiseaza secretul o singura data ca sa-l poti pune si in configul ERP.
set -euo pipefail
ENVF=/opt/swypik/app/infra/hetzner/.env.production

if grep -q '^INTERNAL_SECRET=' "$ENVF"; then
    echo "INTERNAL_SECRET exista deja:"
    grep '^INTERNAL_SECRET=' "$ENVF"
    exit 0
fi

SECRET=$(openssl rand -hex 32)
printf '\n# Moderare ERP <-> Swypik (header x-internal)\nINTERNAL_SECRET=%s\n' "$SECRET" >> "$ENVF"
echo "Adaugat. Foloseste acelasi secret in Multi-ERP:"
echo "INTERNAL_SECRET=$SECRET"
