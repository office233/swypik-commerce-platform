#!/bin/bash
set -e
TUNNEL=swypik-home

# 1. Creare tunel (idempotent)
if ! cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL"; then
  cloudflared tunnel create $TUNNEL
fi
TID=$(cloudflared tunnel list | awk -v t=$TUNNEL '$2==t {print $1}')
echo "TUNNEL_ID=$TID"

# 2. Config ingress
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml <<EOF
tunnel: $TID
credentials-file: /home/dev/.cloudflared/$TID.json

ingress:
  - hostname: swypik.com
    service: http://localhost:3005
  - hostname: www.swypik.com
    service: http://localhost:3005
  - hostname: cdn.swypik.com
    service: http://127.0.0.1:9000
  - hostname: rpc.swypik.com
    service: http://172.17.0.1:8545
  - hostname: scan.swypik.com
    service: http://172.17.0.1:5100
  - hostname: api.swypik.com
    service: http://127.0.0.1:8090
  - hostname: erp.swypik.com
    service: http://127.0.0.1:8091
  - hostname: "*.erp.swypik.com"
    service: http://127.0.0.1:8091
  - service: http_status:404
EOF

# 3. Rute DNS (suprascriu recordurile vechi care pointau la VPS)
for h in swypik.com www cdn rpc scan api erp; do
  cloudflared tunnel route dns --overwrite-dns $TUNNEL $h.swypik.com 2>&1 | tail -1 || true
done
# apex separat (h.swypik.com ar fi gresit pt apex)
cloudflared tunnel route dns --overwrite-dns $TUNNEL swypik.com 2>&1 | tail -1 || true
# wildcard *.erp necesita API - incercam
cloudflared tunnel route dns --overwrite-dns $TUNNEL "*.erp.swypik.com" 2>&1 | tail -1 || echo "WILDCARD: de adaugat manual CNAME *.erp -> $TID.cfargotunnel.com"

# 4. Serviciu systemd
sudo mkdir -p /etc/cloudflared
sudo cp ~/.cloudflared/config.yml /etc/cloudflared/config.yml
sudo cp ~/.cloudflared/$TID.json /etc/cloudflared/
sudo sed -i "s|/home/dev/.cloudflared/$TID.json|/etc/cloudflared/$TID.json|" /etc/cloudflared/config.yml
sudo cloudflared service install 2>/dev/null || true
sudo systemctl enable --now cloudflared
sleep 6
sudo systemctl is-active cloudflared
echo TUNNEL_SETUP_DONE
