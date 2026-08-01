#!/bin/bash
# Verifică produsele atașate clipurilor în feed (WSL local).
curl -s 'http://127.0.0.1:3005/api/explore/feed?limit=12' | python3 -c "
import json, sys
d = json.load(sys.stdin)
for v in d.get('videos', []):
    p = v.get('product') or {}
    print(f\"{(v.get('title') or '')[:32]:34} | {p.get('title','FARA PRODUS')[:30]:32} | {p.get('priceDisplay','')}\")"
