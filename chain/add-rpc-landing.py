#!/usr/bin/env python3
# Adauga o pagina de intampinare pentru GET pe rpc.swypik.com
# (browserele primesc instructiuni; POST-urile JSON-RPC trec neschimbate).
import sys

CONF = "/opt/meister/nginx/nginx.conf"
src = open(CONF).read()

if "rpc-landing" in src:
    print("SKIP: landing exista deja")
    sys.exit(0)

marker = "server_name rpc.swypik.com;"
i = src.find(marker)
if i < 0:
    sys.exit("EROARE: vhost rpc negasit")
j = src.find("location / {", i)

html = (
    '<!DOCTYPE html><html lang=ro><head><meta charset=utf-8>'
    '<meta name=viewport content="width=device-width,initial-scale=1">'
    '<title>Swypik Chain RPC</title>'
    '<style>body{font-family:system-ui;background:linear-gradient(135deg,#2E1065,#6D28D9 55%,#DB2777);color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}'
    'main{max-width:640px;padding:2rem;background:rgba(255,255,255,.07);border-radius:18px;backdrop-filter:blur(6px)}'
    'code{background:rgba(0,0,0,.35);padding:2px 7px;border-radius:6px;font-size:.9em}'
    'a{color:#F9A8D4}h1{margin-top:0}td{padding:4px 10px 4px 0;vertical-align:top}</style></head><body><main>'
    '<h1>Swypik Chain — RPC public</h1>'
    '<p>Acesta este un endpoint <b>JSON-RPC</b> (doar POST), nu o pagina web.</p>'
    '<table>'
    '<tr><td><b>RPC URL</b></td><td><code>https://rpc.swypik.com</code></td></tr>'
    '<tr><td><b>Chain ID</b></td><td><code>643366</code></td></tr>'
    '<tr><td><b>Moneda</b></td><td><code>SWYP</code> (18 zecimale)</td></tr>'
    '<tr><td><b>Explorer</b></td><td><a href=https://scan.swypik.com>scan.swypik.com</a></td></tr>'
    '</table>'
    '<p>Exemplu:</p>'
    '<p><code>curl -X POST -H "Content-Type: application/json" -d \\'"'"'{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}\\'"'"' https://rpc.swypik.com</code></p>'
    '<p><a href=https://swypik.com>&larr; swypik.com</a></p>'
    '</main></body></html>'
)

inject = f'''# rpc-landing: pagina informativa pentru browsere (GET)
            location / {{
                if ($request_method = GET) {{
                    add_header Content-Type "text/html; charset=utf-8";
                    return 200 '{html}';
                }}
'''
src = src[:j] + inject + src[j + len("location / {"):]
open(CONF, "w").write(src)
print("OK: landing adaugat")
