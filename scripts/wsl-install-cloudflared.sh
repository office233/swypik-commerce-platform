#!/bin/bash
set -e
# 1. instalare cloudflared
if ! command -v cloudflared >/dev/null; then
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" | sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq cloudflared 2>&1 | tail -1
fi
cloudflared --version
echo
echo 'GATA. Cand ai tokenul, ruleaza:'
echo '  sudo cloudflared service install <TOKEN>'
