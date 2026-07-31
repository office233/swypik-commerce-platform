#!/usr/bin/env python3
# Injecteaza sub_filter-uri in vhost-ul scan.swypik.com ca sa inlocuiasca
# textele Blockscout din footer cu branding Swypik, direct in HTML.
import re, sys

CONF = "/opt/meister/nginx/nginx.conf"
src = open(CONF).read()

if "Swypik Chain este blockchain-ul" in src:
    print("SKIP: sub_filter-urile exista deja")
    sys.exit(0)

marker = "sub_filter_once on;"
i = src.find("server_name scan.swypik.com;")
j = src.find(marker, i)
if i < 0 or j < 0:
    sys.exit("EROARE: nu gasesc vhost/sub_filter_once")

filters = """sub_filter_once off;
                sub_filter 'Blockscout is a tool for inspecting and analyzing EVM based blockchains. Blockchain explorer for Ethereum Networks.' 'Swypik Chain este blockchain-ul public al platformei Swypik. Orice plata SWYP este verificabila aici, de oricine, fara cont.';
                sub_filter '>BlockScout</h3>' '>Swypik Chain</h3>';
                sub_filter 'Chat (#blockscout)' 'swypik.com';
                sub_filter 'https://discord.gg/blockscout' 'https://swypik.com';
                sub_filter 'https://www.twitter.com/blockscoutcom/' 'https://swypik.com';
                sub_filter '>Submit an Issue</a>' '>Suport Swypik</a>';
                sub_filter '>Contribute</a>' '>Despre Swypik</a>';"""

src = src[:j] + filters + src[j + len(marker):]
open(CONF, "w").write(src)
print("OK: sub_filter-uri adaugate")
