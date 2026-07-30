#!/usr/bin/env bash
echo "--- db roles ---"
docker exec multi-erp-postgres psql -U postgres -c "\du" 2>&1 | head -20
docker exec multi-erp-postgres env | grep -i POSTGRES
echo "--- login response shape ---"
P=$(awk '{print $NF}' /opt/multi-erp/.admin-credentials)
printf '{"username":"admin","password":"%s"}' "$P" > /root/l.json
curl -s -X POST http://127.0.0.1:8091/api/auth/login -H 'Content-Type: application/json' --data-binary @/root/l.json
echo
