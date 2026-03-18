#!/bin/bash
# Migrate orphan tenant data from pos_system (master) to pos_tenant_henber_pharmacy (tenant)
# This data was created by the tenant user before the multi-tenant pool routing fix
set -e

MASTER=pos_system
TENANT=pos_tenant_henber_pharmacy
PSQL="docker exec smarterp-postgres psql -U postgres"

echo "=== MIGRATION: Master -> Tenant ==="
echo ""

# 1. Migrate the cashier user (User1@Hmawanda.com) - needed as FK for sale
echo "--- 1. Migrating user: User1@Hmawanda.com ---"
$PSQL -d $MASTER -t -A -c "
  COPY (SELECT * FROM users WHERE id = 'f3530eb7-73b7-4df0-a860-7950596f3b9c') TO STDOUT
" | $PSQL -d $TENANT -c "COPY users FROM STDIN"
echo "User migrated."

# 2. Migrate 10 customers
echo "--- 2. Migrating customers ---"
$PSQL -d $MASTER -t -A -c "
  COPY (SELECT * FROM customers ORDER BY name) TO STDOUT
" | $PSQL -d $TENANT -c "COPY customers FROM STDIN"
echo "Customers migrated."

# 3. Migrate supplier David
echo "--- 3. Migrating supplier: David ---"
$PSQL -d $MASTER -t -A -c "
  COPY (SELECT * FROM suppliers WHERE \"Id\" = '8a16bf85-28df-405d-b1fd-c058f0104741') TO STDOUT WITH (FORMAT csv, HEADER false)
" | $PSQL -d $TENANT -c "COPY suppliers FROM STDIN WITH (FORMAT csv)"
echo "Supplier migrated."

# 4. Migrate sale
echo "--- 4. Migrating sale: SALE-2026-0001 ---"
$PSQL -d $MASTER -t -A -c "
  COPY (SELECT * FROM sales WHERE id = 'b3e9534e-0cbf-4ce5-9959-24569fbacac0') TO STDOUT
" | $PSQL -d $TENANT -c "COPY sales FROM STDIN"
echo "Sale migrated."

# 5. Migrate sale items
echo "--- 5. Migrating sale_items ---"
$PSQL -d $MASTER -t -A -c "
  COPY (SELECT * FROM sale_items WHERE sale_id = 'b3e9534e-0cbf-4ce5-9959-24569fbacac0') TO STDOUT
" | $PSQL -d $TENANT -c "COPY sale_items FROM STDIN"
echo "Sale items migrated."

# 6. Migrate ledger entries (4 rows - account IDs match between master and tenant)
echo "--- 6. Migrating ledger_entries ---"
$PSQL -d $MASTER -t -A -c "
  COPY (SELECT * FROM ledger_entries) TO STDOUT WITH (FORMAT csv, HEADER false)
" | $PSQL -d $TENANT -c "COPY ledger_entries FROM STDIN WITH (FORMAT csv)"
echo "Ledger entries migrated."

echo ""
echo "=== MIGRATION COMPLETE ==="
echo ""

# Verify counts
echo "=== VERIFICATION ==="
$PSQL -d $TENANT -t -A -c "
SELECT 'customers' as tbl, count(*) FROM customers
UNION ALL SELECT 'sales', count(*) FROM sales
UNION ALL SELECT 'sale_items', count(*) FROM sale_items
UNION ALL SELECT 'ledger_entries', count(*) FROM ledger_entries
UNION ALL SELECT 'users', count(*) FROM users
ORDER BY 1
"
