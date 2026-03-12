#!/usr/bin/env bash
# =============================================================
# SamplePOS Database Backup Script
# Run via cron: 0 */6 * * *  /opt/samplepos/infrastructure/backup.sh
# Backs up pos_system to timestamped compressed files
# Retains last 30 days of backups
# =============================================================
set -euo pipefail

# Configuration  (override via environment)
DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"
DB_NAME="${PGDATABASE:-pos_system}"
DB_USER="${PGUSER:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/samplepos}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

echo "[$(date --iso-8601=seconds)] Starting backup of ${DB_NAME}..."

# Compressed pg_dump — custom format for fast selective restore
pg_dump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="${DB_NAME}" \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-privileges \
  --file="${BACKUP_FILE%.gz}.dump" \
  2>&1

# Also create a plain SQL backup (gzipped) for portability
pg_dump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="${DB_NAME}" \
  --no-owner \
  --no-privileges \
  | gzip > "${BACKUP_FILE}"

BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
echo "[$(date --iso-8601=seconds)] Backup complete: ${BACKUP_FILE} (${BACKUP_SIZE})"

# Prune old backups beyond retention period
PRUNED=$(find "${BACKUP_DIR}" -name "${DB_NAME}_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
PRUNED_DUMP=$(find "${BACKUP_DIR}" -name "${DB_NAME}_*.dump" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
echo "[$(date --iso-8601=seconds)] Pruned $((PRUNED + PRUNED_DUMP)) backups older than ${RETENTION_DAYS} days"

# Verify the backup is valid (quick pg_restore check on custom format)
if pg_restore --list "${BACKUP_FILE%.gz}.dump" > /dev/null 2>&1; then
  echo "[$(date --iso-8601=seconds)] Backup verification: OK"
else
  echo "[$(date --iso-8601=seconds)] WARNING: Backup verification failed!" >&2
  exit 1
fi

echo "[$(date --iso-8601=seconds)] Done."
