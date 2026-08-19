#!/bin/bash
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tc "SELECT string_agg(column_name, ',') FROM information_schema.columns WHERE table_name='swyp_ledger_entries';"
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tc "SELECT count(*), COALESCE(max(id),0) FROM swyp_ledger_entries;"
docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod -tc "SELECT key FROM platform_config LIMIT 5;"
