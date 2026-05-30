#!/bin/bash
# Automated Database Backup Script (CF-WC-106)
#
# Backs up PostgreSQL database to S3 with retention policy

set -euo pipefail

# Configuration
BACKUP_DIR="/tmp/cf-backups"
RETENTION_DAYS=30
DATE=$(date +%Y-%m-%d-%H%M%S)
BACKUP_FILE="cf-db-backup-${DATE}.sql.gz"

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | xargs)
fi

# Validate required env vars
if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ DATABASE_URL not set"
  exit 1
fi

if [ -z "${S3_BUCKET:-}" ]; then
  echo "❌ S3_BUCKET not set"
  exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Extract database connection details from DATABASE_URL
DB_URL=$DATABASE_URL
echo "📦 Creating database backup..."

# Create backup using pg_dump
pg_dump "$DB_URL" | gzip > "$BACKUP_DIR/$BACKUP_FILE"

# Check backup size
BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)
echo "✅ Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

# Upload to S3
echo "☁️  Uploading to S3..."
aws s3 cp "$BACKUP_DIR/$BACKUP_FILE" "s3://$S3_BUCKET/backups/$BACKUP_FILE" \
  --storage-class STANDARD_IA

echo "✅ Backup uploaded to S3"

# Clean up local backup
rm -f "$BACKUP_DIR/$BACKUP_FILE"

# Delete old backups (retention policy)
echo "🗑  Applying retention policy (${RETENTION_DAYS} days)..."
aws s3 ls "s3://$S3_BUCKET/backups/" | while read -r line; do
  FILE=$(echo $line | awk '{print $4}')
  FILE_DATE=$(echo $line | awk '{print $1}')
  FILE_AGE=$(( ( $(date +%s) - $(date -d "$FILE_DATE" +%s) ) / 86400 ))

  if [ $FILE_AGE -gt $RETENTION_DAYS ]; then
    echo "Deleting old backup: $FILE (${FILE_AGE} days old)"
    aws s3 rm "s3://$S3_BUCKET/backups/$FILE"
  fi
done

echo "✅ Backup process completed successfully"

# Send notification (optional)
if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
  curl -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"✅ Database backup completed: $BACKUP_FILE ($BACKUP_SIZE)\"}"
fi
