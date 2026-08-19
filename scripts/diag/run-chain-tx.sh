#!/bin/bash
set -e
PK=$(grep '^SWYP_TREASURY_REWARDS_PK=' /opt/swypik/app/infra/hetzner/.env.production | cut -d= -f2)
docker run --rm --network swypik-chain_default \
  -v /opt/swypik-chain/tools:/w -w /w \
  -e SWYP_TREASURY_REWARDS_PK="$PK" \
  -e SWYP_CHAIN_RPC=http://swypik-chain-rpc:8545 \
  node:20-alpine node tx.mjs
