#!/bin/bash
# Smoke final P1-P7 pe https://swypik.com (curl, fara auth unde nu e nevoie).
B=https://swypik.com
ck() { printf '%-45s %s\n' "$1" "$(curl -s -o /dev/null -w '%{http_code}' -m 25 "$B$1")"; }
ck /
ck /en
ck /en/explore
ck /u/teo_creator_test
ck /auth/login
ck /auth/signup
ck /cart
ck /checkout
ck /fly
ck /food
ck /go
ck /pay
ck /search
ck /cauze
ck /developers
ck /apps
ck /en/live
ck /seller/login
ck /admin
ck /api/health
echo "--- feed pin ---"
curl -s "$B/api/explore/feed?limit=3&page=1&v=87399ec5-5b97-4c53-b473-504f2f3cfa87" | python3 -c 'import json,sys; j=json.load(sys.stdin); v=j["videos"][0]; print("first =", v["id"], "| likes =", v.get("likes"), "| comments =", v.get("comments"))'
