#!/bin/bash
echo '== web-next =='
curl -s -o /dev/null -w '%{http_code}\n' -m 10 http://localhost:3005/api/health
echo '== platform-api =='
docker port swypik-prod-platform-api-1
curl -s -o /dev/null -w '%{http_code}\n' -m 5 http://127.0.0.1:8090/healthz 2>/dev/null || curl -s -o /dev/null -w '%{http_code}\n' -m 5 http://127.0.0.1:8090/health 2>/dev/null || echo 'no health route'
echo '== multi-erp backend =='
docker port multi-erp-backend
curl -s -o /dev/null -w '%{http_code}\n' -m 5 http://127.0.0.1:8091/ 2>/dev/null || echo n/a
echo '== blockscout =='
docker port swypik-blockscout
curl -s -o /dev/null -w '%{http_code}\n' -m 10 http://127.0.0.1:4000/ 2>/dev/null || echo 'inca porneste'
echo '== chain =='
curl -s -m 3 -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://172.17.0.1:8545
echo
echo '== minio =='
docker port swypik-minio
echo '== RAM =='
free -h | head -2
