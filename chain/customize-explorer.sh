#!/usr/bin/env bash
# Personalizare completă Swypik a explorerului Blockscout:
#  • branding: nume "Swypik Chain", logo Swypik, culori aurii (#F5A623)
#  • scoate reclama Blockscout + lista "Other networks" (Gnosis/POA/RSK...)
#  • titlu/descriere/footer proprii
set -euo pipefail
CHAIN_DIR=/opt/swypik-chain
cd "$CHAIN_DIR"

python3 - <<'PY'
p = 'docker-compose.blockscout.yml'
src = open(p).read()

# variabile de branding adăugate în blocul environment al serviciului blockscout
branding = '''      LOGO: "https://swypik.com/icon-192.png"
  LOGO_FOOTER: "https://swypik.com/icon-192.png"
  FOOTER_LOGO: "https://swypik.com/icon-192.png"
      BLOCKSCOUT_VERSION: "Swypik Chain Explorer"
      RELEASE_LINK: "https://swypik.com"
      FOOTER_GITHUB_LINK: "https://swypik.com"
      FOOTER_TWITTER_LINK: "https://swypik.com"
      FOOTER_TELEGRAM_LINK: "https://swypik.com"
      HIDE_BLOCK_MINER: "true"
      SHOW_TXS_CHART: "true"
      SUPPORTED_CHAINS: "[]"
      OTHER_EXPLORERS: "{}"
      SHOW_MAINTENANCE_ALERT: "false"
      DISABLE_KNOWN_TOKENS: "true"
      ENABLE_TXS_STATS: "true"
      SHOW_PRICE_CHART: "false"
      APPS_MENU: "false"
      EXTERNAL_APPS: "[]"
      SEO_DESCRIPTION: "Swypik Chain — explorer public. Vezi fiecare tranzactie, bloc si adresa din reteaua SWYP."
'''

if 'LOGO:' not in src:
    marker = '      DISABLE_EXCHANGE_RATES: "true"'
    src = src.replace(marker, branding + marker, 1)
    open(p, 'w').write(src)
    print('branding adaugat')
else:
    print('branding deja prezent')
PY

docker compose -f docker-compose.blockscout.yml up -d 2>&1 | tail -2
echo "Astept repornirea..."
for i in $(seq 1 10); do
  sleep 8
  CODE=$(curl -s -o /dev/null -w '%{http_code}' http://172.17.0.1:5100/ || true)
  echo "  try $i: $CODE"
  [ "$CODE" = "200" ] && break
done
