#!/usr/bin/env bash
# Branduiește scan.swypik.com (Blockscout 5.4 UI vechi) fără rebuild de imagine:
#  1. Scrie /opt/swypik-chain/branding/swypik-theme.css (violet #7C3AED → roz #EC4899)
#  2. Montează CSS-ul în containerul nginx (meister-nginx) via docker cp
#  3. Adaugă în vhost-ul scan.swypik.com: sub_filter care injectează <link> înainte de </head>
# Idempotent: rulează de câte ori vrei.
set -euo pipefail

CONF=/opt/meister/nginx/nginx.conf
CSS_DIR=/opt/swypik-chain/branding
CSS=$CSS_DIR/swypik-theme.css

mkdir -p "$CSS_DIR"
cat > "$CSS" <<'CSSEOF'
/* ── Swypik Chain Explorer — brand theme ─────────────────────────── */
:root {
  --sw-primary: #7C3AED;
  --sw-primary-dark: #5B21B6;
  --sw-accent: #EC4899;
  --sw-ink: #1E1B4B;
  --sw-bg: #F7F5FF;
  --sw-gradient: linear-gradient(135deg, #7C3AED 0%, #EC4899 100%);
  --sw-gradient-deep: linear-gradient(135deg, #2E1065 0%, #6D28D9 55%, #DB2777 120%);
}

body { background-color: var(--sw-bg) !important; }

/* ascunde bannerul "The new Blockscout UI is now open source!" */
.layout-container > .alert.alert-warning.mb-0.p-3 { display: none !important; }

/* navbar */
.navbar-primary, #top-navbar {
  background: var(--sw-gradient) !important;
  box-shadow: 0 2px 12px rgba(124, 58, 237, .35);
}
.navbar-dark .navbar-nav .nav-link { color: rgba(255,255,255,.92) !important; }
.navbar-dark .navbar-nav .nav-link:hover,
.navbar-dark .navbar-nav .nav-link:focus { color: #fff !important; }
.navbar .form-control, .search-form .form-control {
  border-radius: 10px !important;
  border: none !important;
}
.navbar-logo { max-height: 32px; }

/* numele brandului lângă logo */
.navbar-brand { display: flex !important; align-items: center; gap: 10px; }
.navbar-brand::after {
  content: "Swypik";
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: .3px;
  color: #fff;
  line-height: 1;
}
.navbar-brand::before {
  content: "";
}
/* eticheta "Chain Explorer" sub nume, discretă */
.navbar-brand:hover { text-decoration: none; }

/* hero cu statistici */
.dashboard-banner-container {
  background: var(--sw-gradient-deep) !important;
  border-radius: 0 0 18px 18px;
}
.dashboard-banner-network-plain-container {
  background-color: rgba(255,255,255,.08) !important;
  border-radius: 14px !important;
  border: 1px solid rgba(255,255,255,.14);
  backdrop-filter: blur(4px);
}
.dashboard-banner-network-stats-item { border-left-color: var(--sw-accent) !important; }
.dashboard-banner-chart-legend .dashboard-banner-chart-legend-item::before { background-color: var(--sw-accent) !important; }

/* linkuri & butoane */
a, .tile a { color: var(--sw-primary); }
a:hover { color: var(--sw-primary-dark); }
.btn-line {
  border-color: var(--sw-primary) !important;
  color: var(--sw-primary) !important;
  border-radius: 10px !important;
}
.btn-line:hover, .btn-line:focus {
  background: var(--sw-primary) !important;
  border-color: var(--sw-primary) !important;
  color: #fff !important;
}
.btn-full-primary, .button-primary, .btn-primary {
  background: var(--sw-gradient) !important;
  border: none !important;
  border-radius: 10px !important;
}
.badge.badge-primary, .pagination .page-item.active .page-link {
  background-color: var(--sw-primary) !important;
  border-color: var(--sw-primary) !important;
}

/* carduri & tile-uri */
.card {
  border: none !important;
  border-radius: 14px !important;
  box-shadow: 0 4px 18px rgba(30, 27, 75, .07) !important;
}
.card-title, .card-header h2 { color: var(--sw-ink); }
.tile { border-radius: 12px !important; }
.tile:hover { border-left-color: var(--sw-accent) !important; }
.tile .tile-title, .tile-type-block .tile-title { color: var(--sw-primary) !important; }
.tile.tile-type-block { border-left: 4px solid var(--sw-primary) !important; }
.tile.tile-type-transaction { border-left: 4px solid var(--sw-accent) !important; }

/* ── footer ──────────────────────────────────────────────────────── */
.footer {
  background: linear-gradient(180deg, #221A4E 0%, var(--sw-ink) 100%) !important;
  border-top: 3px solid transparent;
  border-image: var(--sw-gradient) 1;
  padding-top: 2.2rem !important;
}
.footer-link { color: #C4B5FD !important; }
.footer-link:hover { color: var(--sw-accent) !important; text-decoration: none; }
.footer-info-text { color: #DDD6FE !important; max-width: 34rem; }

/* logo + nume brand */
.footer-logo-row { margin-bottom: 1.2rem; }
.footer-brand { display: inline-flex !important; align-items: center; gap: 12px; }
.footer-logo {
  max-height: 44px !important;
  width: 44px; height: 44px;
  border-radius: 12px;
  background: #fff;
  padding: 4px;
  box-shadow: 0 2px 10px rgba(236, 72, 153, .35);
}
.footer-brand::after {
  content: "Swypik Chain";
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: .3px;
  background: linear-gradient(90deg, #C4B5FD, #F9A8D4);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

/* titlu coloană */
.footer-list h3 { color: #fff !important; font-weight: 700; }

/* ascundem linkul de issues (Blockscout) și li-ul lui gol */
.footer-list a[href*="issues/new"] { display: none !important; }
.footer-list li:has(a[href*="issues/new"]) { display: none !important; }

/* iconițele sociale generice (github/twitter Blockscout) — le ascundem */
.footer-social-icons { display: none !important; }

/* butonul Add Swypik (MetaMask) — îl facem buton adevărat */
.js-btn-add-chain-to-mm.in-footer {
  display: inline-block !important;
  margin-top: .6rem;
  padding: .45rem 1rem;
  background: var(--sw-gradient);
  color: #fff !important;
  border-radius: 10px;
  font-weight: 600;
}
.js-btn-add-chain-to-mm.in-footer:hover { opacity: .9; }

/* linia cu versiunea */
.footer-body > div:last-child {
  margin-top: 1.4rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(196, 181, 253, .18);
  color: #A5B4FC;
  font-size: .85rem;
}

/* alerta de indexare — mai discretă, pe brand */
.layout-container > .alert-info, .alert-info {
  background: #EDE9FE !important;
  border-color: #DDD6FE !important;
  color: #5B21B6 !important;
}

/* spinner / loading */
.loading-spinner-block-1, .loading-spinner-block-2 { background-color: var(--sw-primary) !important; }
CSSEOF
echo "OK: $CSS scris"

# copiem CSS-ul în docroot-ul static al nginx-ului (servit direct din vhost)
docker cp "$CSS" meister-nginx:/etc/nginx/swypik-theme.css

# injectăm sub_filter + location pentru CSS în vhost-ul scan.swypik.com
python3 - "$CONF" <<'PY'
import re, sys
p = sys.argv[1]
src = open(p).read()

if 'swypik-theme.css' in src:
    print("SKIP: vhost deja branduit")
    sys.exit(0)

marker = 'server_name scan.swypik.com;'
i = src.find(marker)
if i < 0:
    sys.exit("EROARE: vhost scan.swypik.com negasit")

# gasim "location / {" din acest server block
j = src.find('location / {', i)
inject = '''location = /swypik-theme.css {
                alias /etc/nginx/swypik-theme.css;
                add_header Cache-Control "public, max-age=300";
            }

            location / {
                proxy_set_header Accept-Encoding "";
                sub_filter_once on;
                sub_filter '</head>' '<link rel="stylesheet" href="/swypik-theme.css"></head>';
'''
src = src[:j] + inject + src[j + len('location / {'):]
open(p, 'w').write(src)
print("OK: sub_filter injectat")
PY

docker exec meister-nginx nginx -t && docker exec meister-nginx nginx -s reload
echo "OK: nginx reincarcat — verifica https://scan.swypik.com/"
