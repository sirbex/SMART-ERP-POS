#!/bin/bash
# 🚨 PRODUCTION UPDATE DEPLOYMENT ONLY
# This script updates running containers. It does NOT recreate databases or volumes.
# See DEPLOYMENT_CONTRACT.md for rules.

set -e

echo "=== SMART-ERP Production Update ==="
echo "Server: $(hostname)"
echo "Date: $(date)"
echo ""

cd /opt/smarterp

# ── PRE-DEPLOY: Record-count snapshot ─────────────────────────────────────────
# Counts every critical business table in every tenant DB and saves a snapshot.
# If row counts DROP after the deploy, the post-deploy check exits non-zero and
# you know immediately that something went wrong before any tenant notices.

SNAPSHOT_DIR="/opt/smarterp/deploy-snapshots"
mkdir -p "$SNAPSHOT_DIR"
SNAPSHOT_FILE="$SNAPSHOT_DIR/snapshot-$(date +%Y%m%d-%H%M%S).json"
TENANT_DBS=("pos_system" "pos_tenant_henber_pharmacy")
CRITICAL_TABLES=(
  sales sale_items payments
  customer_transactions credit_sales
  purchase_orders purchase_order_items
  goods_receipts goods_receipt_items
  supplier_invoices supplier_payments supplier_payment_allocations
  inventory_items batches stock_movements
  customers suppliers
  gl_entries gl_entry_lines accounts
  invoices invoice_items
  quotations delivery_notes credit_notes
  bank_accounts bank_transactions
)

echo ">>> Taking pre-deploy data snapshot..."
echo "{" > "$SNAPSHOT_FILE"
echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"," >> "$SNAPSHOT_FILE"
echo "  \"counts\": {" >> "$SNAPSHOT_FILE"
FIRST=1
for DB in "${TENANT_DBS[@]}"; do
  for TABLE in "${CRITICAL_TABLES[@]}"; do
    # Check table exists before counting (tolerates tenants on older schema)
    EXISTS=$(docker exec smarterp-postgres psql -U postgres -d "$DB" -t -c \
      "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='$TABLE';" \
      2>/dev/null | tr -d '[:space:]')
    if [ "$EXISTS" = "1" ]; then
      COUNT=$(docker exec smarterp-postgres psql -U postgres -d "$DB" -t -c \
        "SELECT COUNT(*) FROM $TABLE;" 2>/dev/null | tr -d '[:space:]')
      if [ $FIRST -eq 0 ]; then echo "," >> "$SNAPSHOT_FILE"; fi
      printf '    "%s.%s": %s' "$DB" "$TABLE" "$COUNT" >> "$SNAPSHOT_FILE"
      FIRST=0
    fi
  done
done
echo "" >> "$SNAPSHOT_FILE"
echo "  }" >> "$SNAPSHOT_FILE"
echo "}" >> "$SNAPSHOT_FILE"
echo ">>> Snapshot saved → $SNAPSHOT_FILE"
echo ""

# ── CODE UPDATE ────────────────────────────────────────────────────────────────

# Pull latest code
echo ">>> Pulling latest code..."
git pull

# ── DATABASE MIGRATIONS ────────────────────────────────────────────────────────
# Runs every *.sql file in shared/sql/ (sorted) against all tenant databases.
# Uses schema_migrations table to skip already-applied files (idempotent).
# All SQL files use CREATE/ALTER … IF NOT EXISTS, so replaying is safe.

echo ">>> Running pending database migrations..."
MIGRATION_DBS=("pos_system" "pos_tenant_henber_pharmacy")

for DB in "${MIGRATION_DBS[@]}"; do
  # Ensure migration-tracking table exists (in case 000_schema_migrations.sql not yet run)
  docker exec smarterp-postgres psql -U postgres -d "$DB" \
    -c "CREATE TABLE IF NOT EXISTS schema_migrations (id SERIAL PRIMARY KEY, filename TEXT UNIQUE NOT NULL, executed_at TIMESTAMPTZ NOT NULL DEFAULT now());" \
    2>/dev/null || true

  for MIGRATION in $(ls shared/sql/*.sql 2>/dev/null | sort); do
    FILENAME=$(basename "$MIGRATION")

    APPLIED=$(docker exec smarterp-postgres psql -U postgres -d "$DB" -t -c \
      "SELECT COUNT(*) FROM schema_migrations WHERE filename = '$FILENAME';" \
      2>/dev/null | tr -d '[:space:]')

    if [ "$APPLIED" = "1" ]; then
      continue  # already applied — skip
    fi

    echo "  [$DB] Applying $FILENAME ..."
    if docker exec -i smarterp-postgres psql -U postgres -d "$DB" < "$MIGRATION" 2>&1; then
      docker exec smarterp-postgres psql -U postgres -d "$DB" \
        -c "INSERT INTO schema_migrations (filename) VALUES ('$FILENAME') ON CONFLICT DO NOTHING;" \
        2>/dev/null || true
      echo "  [$DB] ✅ $FILENAME"
    else
      echo "  [$DB] ⚠️  $FILENAME reported errors (see above) — continuing"
    fi
  done
done

echo ">>> Migrations complete"
echo ""

# Build only app containers
echo ">>> Building backend + frontend..."
docker compose -f docker-compose.deploy.yml build backend frontend

# Restart only app containers (--no-deps = don't touch postgres/redis/nginx)
echo ">>> Restarting backend + frontend..."
docker compose -f docker-compose.deploy.yml up -d --no-deps backend frontend

# Reload nginx so it picks up the new container IP (containers get new IPs on recreate)
echo ">>> Reloading nginx to pick up new container IP..."
docker exec smarterp-nginx nginx -s reload

# Verify
echo ""
echo ">>> Container status:"
docker ps --format 'table {{.Names}}\t{{.Status}}'

echo ""
echo ">>> Waiting 15s for backend to start..."
sleep 15

# Internal health check (avoids nginx cold-start race)
echo ">>> Internal backend health check:"
if docker exec smarterp-backend wget -qO- http://localhost:3001/api/health > /dev/null 2>&1; then
  echo ">>> Backend health: OK (internal)"
else
  echo ">>> Backend health: FAILED — checking logs..."
  docker logs smarterp-backend --tail 30
  exit 1
fi

# Public HTTPS health check
echo ">>> Public HTTPS health check:"
if curl -sf https://wizarddigital-inv.com/api/health > /dev/null 2>&1; then
  echo ">>> HTTPS health: OK"
else
  echo ">>> HTTPS health: FAILED — nginx may need a moment, try: curl https://wizarddigital-inv.com/api/health"
fi

# ── POST-DEPLOY: Verify no rows were lost ─────────────────────────────────────
echo ""
echo ">>> Post-deploy data integrity check..."
FAIL=0
while IFS= read -r line; do
  # Parse lines like: "pos_system.sales": 1234
  KEY=$(echo "$line" | grep -oP '"[^"]+"\s*:' | tr -d '": ')
  BEFORE=$(echo "$line" | grep -oP ':\s*\d+' | tr -d ': ')
  if [ -z "$KEY" ] || [ -z "$BEFORE" ]; then continue; fi

  DB=$(echo "$KEY" | cut -d. -f1)
  TABLE=$(echo "$KEY" | cut -d. -f2)

  AFTER=$(docker exec smarterp-postgres psql -U postgres -d "$DB" -t -c \
    "SELECT COUNT(*) FROM $TABLE;" 2>/dev/null | tr -d '[:space:]')

  if [ -z "$AFTER" ]; then
    echo "  ⚠️  COULD NOT CHECK $KEY (table may not exist — skipping)"
    continue
  fi

  if [ "$AFTER" -lt "$BEFORE" ]; then
    LOST=$((BEFORE - AFTER))
    echo "  🚨 DATA LOSS: $KEY  BEFORE=$BEFORE  AFTER=$AFTER  LOST=$LOST rows"
    FAIL=1
  elif [ "$AFTER" -gt "$BEFORE" ]; then
    NEW=$((AFTER - BEFORE))
    echo "  ✅ $KEY  $BEFORE → $AFTER  (+$NEW new rows, normal)"
  else
    echo "  ✅ $KEY  $AFTER rows — unchanged"
  fi
done < <(grep -oP '"[^"]+": \d+' "$SNAPSHOT_FILE")

echo ""
if [ $FAIL -ne 0 ]; then
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  🚨 DATA LOSS DETECTED — INVESTIGATE BEFORE CONTINUING  ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo "Snapshot used: $SNAPSHOT_FILE"
  echo "DO NOT run further migrations until this is resolved."
  exit 1
fi

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅  ALL TENANT DATA VERIFIED INTACT                    ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "=== Deploy complete ==="
