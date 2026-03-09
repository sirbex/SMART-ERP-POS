#!/bin/bash
# ============================================================
# Database Backup Script — SMART-ERP-POS
# ============================================================
# Usage:
#   ./scripts/backup-db.sh                      # Local backup
#   ./scripts/backup-db.sh --s3                  # Upload to S3
#   BACKUP_RETENTION_DAYS=30 ./scripts/backup-db.sh  # Custom retention
#
# Schedule via cron:
#   0 2 * * * /path/to/scripts/backup-db.sh --s3 >> /var/log/pos-backup.log 2>&1
# ============================================================

set -euo pipefail

# Configuration (override via environment)
DB_NAME="${POSTGRES_DB:-pos_system}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
UPLOAD_S3="${1:-}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SMART-ERP-POS Database Backup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Database: $DB_NAME@$DB_HOST:$DB_PORT"
echo "Output:   $BACKUP_FILE"
echo "Retention: $RETENTION_DAYS days"
echo ""

# Create compressed backup
echo "📦 Creating backup..."
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --format=custom --compress=9 --no-owner --no-privileges \
  | gzip > "$BACKUP_FILE"

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✅ Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

# Upload to S3 if requested
if [ "$UPLOAD_S3" = "--s3" ] && [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  echo "☁️  Uploading to S3: s3://$BACKUP_S3_BUCKET/"
  aws s3 cp "$BACKUP_FILE" "s3://$BACKUP_S3_BUCKET/$(basename "$BACKUP_FILE")" \
    --storage-class STANDARD_IA
  echo "✅ S3 upload complete"
fi

# Clean up old backups
echo "🧹 Removing backups older than $RETENTION_DAYS days..."
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete -print | wc -l)
echo "   Removed $DELETED old backup(s)"

echo ""
echo "✅ Backup complete"
