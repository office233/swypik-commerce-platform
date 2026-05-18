#!/bin/bash
set -euo pipefail
cd /opt/swypik/app

docker cp /opt/swypik/app/scripts/enqueue-ae-videos.mjs swypik-prod-web-next-1:/tmp/enqueue-ae-videos.mjs
docker exec swypik-prod-web-next-1 sh -c 'rm -rf /tmp/node_modules && ln -s /app/node_modules /tmp/node_modules'
docker exec -w /tmp swypik-prod-web-next-1 node /tmp/enqueue-ae-videos.mjs
