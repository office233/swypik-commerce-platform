#!/usr/bin/env bash
# E2E: business nou Swypik -> aprobare ERP -> tenant functional. Ruleaza pe VPS.
set -uo pipefail
ERP=http://127.0.0.1:8091
SWY=https://swypik.com
ADMIN_PASS=$(awk '{print $NF}' /opt/multi-erp/.admin-credentials)
PSQL_ERP="docker exec multi-erp-postgres psql -U multi -d multi_erp"
INTERNAL_SECRET=$(grep -oP '(?<=^INTERNAL_SECRET=).*' /opt/multi-erp/.env)
TS=$(date +%s)
EMAIL="e2e-test-${TS}@swypik.com"
step(){ echo; echo "===== $1 ====="; }

step "1. APPLY SELLER"
APPLY=$(curl -s -X POST $SWY/api/apply-seller -H 'Content-Type: application/json' -d "{\"companyName\":\"Test Business E2E SRL\",\"cui\":\"RO99887766\",\"email\":\"$EMAIL\",\"phone\":\"+40712345678\",\"productType\":\"electronice\"}")
echo "$APPLY"

step "1b. SELLER ID din Swypik DB"
SELLER_ID=$(docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tAc "SELECT id FROM sellers WHERE email='$EMAIL' ORDER BY created_at DESC LIMIT 1")
if [ -z "$SELLER_ID" ]; then
	echo "apply esuat (probabil rate limit) — reutilizez ultimul seller de test si il resetez la pending"
	SELLER_ID=$(docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tAc "SELECT id FROM sellers WHERE name='Test Business E2E SRL' ORDER BY created_at DESC LIMIT 1")
	docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -c "UPDATE sellers SET status='pending', erp_connected=false, erp_api_key=NULL WHERE id='$SELLER_ID'" >/dev/null
	EMAIL=$(docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tAc "SELECT email FROM sellers WHERE id='$SELLER_ID'")
fi
echo "SELLER_ID=$SELLER_ID"
[ -z "$SELLER_ID" ] && { echo "FAIL: seller negasit in DB"; exit 1; }

step "2. INTERNAL PENDING (direct Swypik, x-internal)"
curl -s "$SWY/api/internal/moderation/pending?type=seller" -H "x-internal: $INTERNAL_SECRET" | head -c 800; echo

step "3a. ERP ADMIN LOGIN"
printf '{"username":"admin","password":"%s"}' "$ADMIN_PASS" > /root/l.json
TOK=$(curl -s -X POST $ERP/api/auth/login -H 'Content-Type: application/json' --data-binary @/root/l.json | python3 -c 'import sys,json;d=json.load(sys.stdin);print((d.get("data") or {}).get("token") or d.get("token") or "")')
echo "TOK len=${#TOK}"
[ -z "$TOK" ] && { echo "FAIL: login admin"; exit 1; }

step "3b. ERP MODERATION PENDING"
curl -s "$ERP/api/moderation/pending?type=seller" -H "Authorization: Bearer $TOK" | head -c 800; echo

step "3c. APPROVE SELLER $SELLER_ID"
DEC=$(curl -s -X POST "$ERP/api/moderation/seller/$SELLER_ID/approve" -H "Authorization: Bearer $TOK")
echo "$DEC"
API_KEY=$(echo "$DEC" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("api_key",""))')
OWNER_U=$(echo "$DEC" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("owner_username",""))')
OWNER_P=$(echo "$DEC" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("owner_password",""))')
TENANT_ID=$(echo "$DEC" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("tenant_id",""))')
echo "TENANT_ID=$TENANT_ID OWNER=$OWNER_U API_KEY=${API_KEY:0:12}..."
[ -z "$API_KEY" ] && { echo "FAIL: approve fara api_key"; exit 1; }

step "4a. VERIFICA SWYPIK DB"
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -c "SELECT id,status,erp_connected,(erp_api_key IS NOT NULL) AS has_key FROM sellers WHERE id='$SELLER_ID'"

step "4b. VERIFICA ERP DB"
$PSQL_ERP -c "SELECT id,slug,company_name FROM tenants WHERE id=$TENANT_ID"
$PSQL_ERP -c "SELECT u.id,u.username,tu.role FROM users u JOIN tenant_users tu ON tu.user_id=u.id WHERE tu.tenant_id=$TENANT_ID"

step "5. LOGIN OWNER"
printf '{"username":"%s","password":"%s"}' "$OWNER_U" "$OWNER_P" > /root/ol.json
OLOGIN=$(curl -s -X POST $ERP/api/auth/login -H 'Content-Type: application/json' --data-binary @/root/ol.json)
OTOK=$(echo "$OLOGIN" | python3 -c 'import sys,json;d=json.load(sys.stdin);print((d.get("data") or {}).get("token") or d.get("token") or "")')
echo "owner tok len=${#OTOK}"
[ -z "$OTOK" ] && { echo "FAIL: login owner: $OLOGIN"; exit 1; }
echo "-- branding:"; curl -s $ERP/api/tenant/branding -H "Authorization: Bearer $OTOK" | head -c 400; echo
echo "-- appstore:"; curl -s $ERP/api/appstore/ -H "Authorization: Bearer $OTOK" | head -c 600; echo

step "6. PARTNER PING"
curl -s $SWY/api/partner/ping -H "X-Api-Key: $API_KEY"; echo

step "7a. CREATE PRODUCT"
PROD=$(curl -s -X POST $ERP/api/warehouse/products -H "Authorization: Bearer $OTOK" -H 'Content-Type: application/json' -d '{"denumire":"Produs Test E2E","cod_bare":"E2E0001","pret_vanz":100,"pret_v_tva":119,"tva_rate":19,"stoc":10,"categorie":"Test","um":"buc"}')
echo "$PROD"
PID=$(echo "$PROD" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("id") or (d.get("data") or {}).get("id") or "")' 2>/dev/null)
[ -z "$PID" ] && PID=$($PSQL_ERP -tAc "SELECT id FROM products WHERE denumire='Produs Test E2E' AND tenant_id=$TENANT_ID ORDER BY id DESC LIMIT 1")
echo "PRODUCT_ID=$PID"

step "7b. PUBLISH -> SWYPIK"
curl -s -X POST $ERP/api/swypik/publish -H "Authorization: Bearer $OTOK" -H 'Content-Type: application/json' -d "{\"product_ids\":[$PID]}"; echo
echo "-- marketplace_products in Swypik:"
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -c "SELECT id,title,source_type,seller_id FROM marketplace_products WHERE source_type='multi_erp' ORDER BY created_at DESC LIMIT 5"

step "DONE — date de test"
echo "SELLER_ID=$SELLER_ID TENANT_ID=$TENANT_ID OWNER=$OWNER_U PRODUCT_ID=$PID"
