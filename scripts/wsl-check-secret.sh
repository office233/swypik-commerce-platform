#!/bin/bash
echo "--- AUTH_SECRET in container? ---"
docker exec swypik-prod-web-next-1 sh -c 'test -n "$AUTH_SECRET" && echo AUTH_SECRET=SET || echo AUTH_SECRET=LIPSESTE'
docker exec swypik-prod-web-next-1 sh -c 'test -n "$SWYP_WALLET_KEY" && echo SWYP_WALLET_KEY=SET || echo SWYP_WALLET_KEY=LIPSESTE'
echo "--- eroarea exacta din log ---"
docker logs swypik-prod-web-next-1 --since 60m 2>&1 | grep -iE 'cripta|wallet' | tail -5
echo "--- eroarea SQL parameter \$3 ---"
docker logs swypik-prod-web-next-1 --since 60m 2>&1 | grep -B2 -A2 'inconsistent types' | tail -10
