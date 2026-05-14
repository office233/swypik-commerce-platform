#!/usr/bin/env bash
# Swypik DB → R2 offsite backup.
# Restore: aws s3 cp s3://swypik-backups/postgres/YYYY-MM-DD.sql.gz - --endpoint-url=$R2_ENDPOINT | gunzip | docker exec -i swypik-prod-postgres-1 psql -U swypik -d swypik
set -euo pipefail

: "${R2_ENDPOINT:?missing}"
: "${R2_BUCKET:=swypik-backups}"
: "${AWS_ACCESS_KEY_ID:?missing}"
: "${AWS_SECRET_ACCESS_KEY:?missing}"
PG_CONTAINER="${PG_CONTAINER:-swypik-prod-postgres-1}"
PG_USER="${PG_USER:-swypik}"
PG_DB="${PG_DB:-swypik}"

DATE=$(date +%F)
KEY="postgres/${DATE}.sql.gz"

docker exec -i "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB"   | gzip -9   | aws s3 cp - "s3://${R2_BUCKET}/${KEY}" --endpoint-url "$R2_ENDPOINT"

echo "✅ backup ${KEY} uploaded"

# Retention: keep 30 days
THRESHOLD=$(date -d "30 days ago" +%F)
aws s3 ls "s3://${R2_BUCKET}/postgres/" --endpoint-url "$R2_ENDPOINT" | awk '{print $4}' | while read f; do
  d=$(echo "$f" | sed 's/.sql.gz//')
  if [[ "$d" < "$THRESHOLD" ]]; then
    aws s3 rm "s3://${R2_BUCKET}/postgres/$f" --endpoint-url "$R2_ENDPOINT"
  fi
done
