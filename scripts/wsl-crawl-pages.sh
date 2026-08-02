#!/bin/bash
# Crawl toate paginile [locale] + admin/seller/etc pe http://127.0.0.1:3005 (Valul 2).
# Raporteaza doar status != 200/301/302/307/308/401/403 (401/403 = protejate, OK).
cd /opt/swypik/app
BASE=http://127.0.0.1:3005
fail=0; total=0
# paginile din app/: page.tsx -> ruta
find app -name page.tsx | sed 's|^app||; s|/page.tsx$||' | while read -r p; do
  # sare grupurile dinamice fara date cunoscute
  case "$p" in
    *"["*"]"*) continue ;;
  esac
  route=$(printf '%s' "$p" | sed 's|^/\[locale\]|/en|; s|/(\([a-z]*\))||g')
  [ -z "$route" ] && route="/"
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$BASE$route")
  case "$code" in
    200|301|302|307|308|401|403) ;;
    *) echo "FAIL $code $route" ;;
  esac
done
echo "CRAWL_DONE"
