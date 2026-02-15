# Data Reset Architecture

## Overview

This document describes the architecture and standards for data reset operations in SamplePOS. The reset functionality follows the same principles as all data management in the system:

- **Consistency**: All balances are derived from source data, never set directly
- **Accuracy**: Database recalculation functions ensure correct values
- **Precision**: Decimal.js for all financial calculations
- **Compliance**: Full audit trail and pre-reset backups

## Single Source of Truth Architecture

### Problem with Direct Balance Updates

Previously, reset functions used direct SQL updates:

```sql
-- ❌ WRONG: Direct balance updates bypass the single source of truth
UPDATE customers SET balance = 0 WHERE balance != 0;
UPDATE suppliers SET "OutstandingBalance" = 0;
UPDATE products SET quantity_on_hand = 0;
```

This approach had several issues:
1. **Inconsistency**: Different code paths could set balances differently
2. **No Verification**: No way to know if the reset was correct
3. **Double-counting Risk**: If triggers are active, both direct update AND trigger could fire

### Solution: Recalculation Functions

The correct approach uses database recalculation functions that derive balances from source data:

```sql
-- ✅ CORRECT: Recalculate from source data
SELECT * FROM fn_recalculate_all_customer_balances();
SELECT * FROM fn_recalculate_all_supplier_balances();
SELECT * FROM fn_recalculate_all_product_stock();
SELECT * FROM fn_recalculate_all_account_balances();
```

After deleting all transactional data, these functions will correctly calculate 0 for all balances.

## Database Functions

### Location
`shared/sql/bulk_recalculation_functions.sql`

### Available Functions

| Function | Purpose | Source Data |
|----------|---------|-------------|
| `fn_recalculate_all_customer_balances()` | Customer AR balances | sales + customer_payments |
| `fn_recalculate_all_supplier_balances()` | Supplier AP balances | goods_receipts + supplier_payments |
| `fn_recalculate_all_product_stock()` | Product quantities | inventory_batches |
| `fn_recalculate_all_account_balances()` | GL account balances | ledger_entries |
| `fn_recalculate_all_balances()` | Master function - calls all above | All sources |
| `fn_verify_post_reset_integrity()` | Verification checks | Cross-reference all |

### Function Return Values

Each recalculation function returns:
- `entity_id`: UUID of the entity
- `old_balance`: Balance before recalculation
- `new_balance`: Balance after recalculation
- `status`: 'UPDATED' or 'NO_CHANGE'

### Master Recalculation

```sql
-- Recalculate everything with timing info
SELECT * FROM fn_recalculate_all_balances();

-- Returns:
-- entity_type | total_records | records_updated | records_unchanged | execution_time_ms
-- CUSTOMERS   | 150           | 50              | 100               | 125.5
-- SUPPLIERS   | 25            | 10              | 15                | 45.2
-- PRODUCTS    | 500           | 200             | 300               | 350.8
-- ACCOUNTS    | 75            | 30              | 45                | 22.1
```

## Reset Flow

### 1. Pre-Reset Safety

Before any reset:
1. **Confirmation Phrase**: User must type exact phrase to confirm
2. **Mandatory Backup**: Automatic full backup created before reset
3. **Maintenance Mode**: System enters maintenance mode
4. **Audit Log**: Reset operation logged with user, timestamp, reason

### 2. Data Deletion (Phases 1-7)

Transactional data is deleted in FK-safe order:
1. Accounting/GL data (ledger_entries, journal_entries)
2. Sales & customer transactions
3. Purchase orders & goods receipts
4. Inventory batches & stock movements
5. Supplier invoices & payments
6. Customer deposits & credit applications
7. System logs (except audit_log)

### 3. Balance Recalculation (Phase 8)

```typescript
// NEW: Uses recalculation functions
const custResult = await client.query(`
    SELECT COUNT(*) FILTER (WHERE status = 'UPDATED') as updated_count
    FROM fn_recalculate_all_customer_balances()
`);
```

With fallback to direct reset if functions don't exist:
```typescript
// Fallback only if recalculation function doesn't exist
await client.query(`
    UPDATE customers SET balance = 0, updated_at = NOW() WHERE balance != 0
`);
```

### 4. Integrity Verification (Phase 9)

```sql
SELECT * FROM fn_verify_post_reset_integrity();
```

Checks performed:
- Customer balances match outstanding credit sales
- Supplier balances match outstanding GR values
- Product quantities match active batch totals
- GL accounts reflect ledger entries
- No orphaned records exist

## Implementation Files

### Repository Layer

| File | Function | Changes Made |
|------|----------|--------------|
| `systemManagementRepository.ts` | `clearAllTransactionalData()` | Now uses recalculation functions |
| `adminRepository.ts` | `clearAllTransactions()` | Now uses recalculation functions |

### SQL Scripts

| File | Purpose |
|------|---------|
| `bulk_recalculation_functions.sql` | Recalculation function definitions |
| `data_integrity_check.sql` | Periodic integrity verification |
| `comprehensive_data_triggers.sql` | Trigger definitions (reference) |

## Deployment

### Installing the Functions

Run the SQL script to create the recalculation functions:

```powershell
psql -U postgres -d pos_system -f shared/sql/bulk_recalculation_functions.sql
```

Or via the application:
```bash
npm run db:migrate
```

### Verifying Installation

```sql
-- Check functions exist
SELECT proname FROM pg_proc 
WHERE proname LIKE 'fn_recalculate_all%';

-- Expected output:
-- fn_recalculate_all_customer_balances
-- fn_recalculate_all_supplier_balances
-- fn_recalculate_all_product_stock
-- fn_recalculate_all_account_balances
-- fn_recalculate_all_balances
```

## Compliance Checklist

When performing a data reset, verify:

- [ ] Confirmation phrase entered correctly
- [ ] Pre-reset backup created and verified
- [ ] Maintenance mode enabled
- [ ] All transactional tables cleared
- [ ] Balances recalculated (not directly set)
- [ ] Post-reset integrity verification passed
- [ ] Maintenance mode disabled
- [ ] Audit log entry created

## Troubleshooting

### Recalculation Function Not Found

If you see:
```
Supplier balance recalculation skipped: function fn_recalculate_all_supplier_balances() does not exist
Used fallback direct reset for supplier balances
```

Run the SQL script to install the functions:
```bash
psql -U postgres -d pos_system -f shared/sql/bulk_recalculation_functions.sql
```

### Post-Reset Integrity Failures

If verification shows failures:
```
Post-reset integrity issues detected: CUSTOMER_BALANCES_ZERO: Customer balances should match outstanding credit sales
```

Run manual recalculation:
```sql
SELECT * FROM fn_recalculate_all_balances();
SELECT * FROM fn_verify_post_reset_integrity();
```

### Triggers Disabled During Reset

The reset process temporarily disables triggers for performance:
```sql
SET session_replication_role = replica;  -- Disables triggers
-- ... deletions ...
SET session_replication_role = DEFAULT;  -- Re-enables triggers
```

This is safe because:
1. We're in a transaction
2. We recalculate all balances after data deletion
3. Triggers are re-enabled before commit

## Related Documentation

- [Data Integrity Check](../shared/sql/data_integrity_check.sql) - Periodic verification script
- [Comprehensive Triggers](../shared/sql/comprehensive_data_triggers.sql) - Trigger definitions
- [Copilot Implementation Rules](./COPILOT_IMPLEMENTATION_RULES.md) - General coding standards

---

**Last Updated**: January 2025  
**Architecture**: Single Source of Truth for all calculated values
