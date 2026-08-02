#!/bin/bash
# npm ci + tsc --noEmit (Faza 2)
docker run --rm -v /opt/swypik/app:/app -w /app node:20-alpine sh -c 'npm install --no-audit --no-fund --loglevel=error > /tmp/npm.out 2>&1; echo "NPM_EXIT=$?"; tail -3 /tmp/npm.out; npx tsc --noEmit > /tmp/tsc.out 2>&1; ec=$?; echo "TSC_EXIT=$ec"; grep -c "error TS" /tmp/tsc.out; tail -15 /tmp/tsc.out'
