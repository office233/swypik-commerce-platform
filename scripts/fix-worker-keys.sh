#!/bin/bash
# Fix: workerul video avea AWS_ACCESS_KEY_ID=placeholder — ii dau cheile MinIO
# (aceleasi pe care le foloseste web-next: S3_ACCESS_KEY/S3_SECRET_KEY).
set -e
ENVF=/opt/swypik/app/infra/hetzner/.env.production
SK=$(docker exec swypik-prod-web-next-1 printenv S3_SECRET_KEY)
AK=$(docker exec swypik-prod-web-next-1 printenv S3_ACCESS_KEY)

if grep -q '^AWS_ACCESS_KEY_ID=' "$ENVF"; then
  sed -i "s|^AWS_ACCESS_KEY_ID=.*|AWS_ACCESS_KEY_ID=$AK|" "$ENVF"
else
  echo "AWS_ACCESS_KEY_ID=$AK" >> "$ENVF"
fi
if grep -q '^AWS_SECRET_ACCESS_KEY=' "$ENVF"; then
  sed -i "s|^AWS_SECRET_ACCESS_KEY=.*|AWS_SECRET_ACCESS_KEY=$SK|" "$ENVF"
else
  echo "AWS_SECRET_ACCESS_KEY=$SK" >> "$ENVF"
fi
echo "chei setate (AK=$AK)"

cd /opt/swypik/app
docker compose -f infra/hetzner/docker-compose.prod.yml \
  -f infra/hetzner/docker-compose.vps.yml \
  -f infra/hetzner/docker-compose.minio.yml \
  --env-file infra/hetzner/.env.production up -d video-worker 2>&1 | tail -3
sleep 8
docker exec swypik-prod-video-worker-1 printenv AWS_ACCESS_KEY_ID
