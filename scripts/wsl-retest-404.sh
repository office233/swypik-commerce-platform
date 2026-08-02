#!/bin/bash
sleep 5
for r in /cauze /developers /apps /en; do
  printf '%s = ' "$r"
  curl -s -o /dev/null -w '%{http_code}' -m 20 "http://127.0.0.1:3005$r"
  echo
done
