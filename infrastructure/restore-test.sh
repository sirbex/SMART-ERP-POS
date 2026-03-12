#!/usr/bin/env bash
# ============================================================
# Backup Restore Verification Script
# Validates that the most recent backup can be restored into
# a temporary database, checks table counts, then cleans up.
#
# Usage (from host with Docker):
#   docker compose -f docker-compose.production.yml exec db-backup \
#     sh /usr/local/bin/restore-test.sh
#
# Or with a local psql/pg_restore:
#   PGHOST=localhost PGUSER=postgres PGPASSWORD=... \
#     bash infrastructure/restore-test.sh
# ============================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
TEST_DB="pos_system_restore_test"

# --- Find latest .custom backup ---
LATEST=$(find "$BACKUP_DIR" -maxdepth 1 -name '*.custom' -type f | sort | tail -n 1)
if [ -z "$LATEST" ]; then
  echo "FAIL: No .custom backup files found in $BACKUP_DIR"
  exit 1
fi
echo "Using backup: $LATEST"

cleanup() {
  echo "Cleaning up test database..."
  dropdb --if-exists "$TEST_DB" 2>/dev/null || true
}
trap cleanup EXIT

# --- Create temporary database ---
echo "Creating test database: $TEST_DB"
createdb "$TEST_DB"

# --- Restore ---
echo "Restoring backup..."
pg_restore --dbname="$TEST_DB" --no-owner --no-privileges --exit-on-error "$LATEST"
echo "Restore completed successfully."

# --- Validate critical tables ---
CRITICAL_TABLES="products sales sale_items inventory_batches purchase_orders goods_receipts stock_movements accounts journal_entries"
ALL_OK=true

echo ""
echo "Table validation:"
for TABLE in $CRITICAL_TABLES; do
  COUNT=$(psql -d "$TEST_DB" -tAc "SELECT count(*) FROM $TABLE" 2>/dev/null || echo "MISSING")
  if [ "$COUNT" = "MISSING" ]; then
    echo "  FAIL: $TABLE — table does not exist"
    ALL_OK=false
  else
    echo "  OK:   $TABLE — $COUNT rows"
  fi
done

echo ""
if [ "$ALL_OK" = true ]; then
  echo "PASS: Backup restore verification succeeded."
  exit 0
else
  echo "FAIL: Some critical tables are missing — backup may be incomplete."
  exit 1
fi
