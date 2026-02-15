# Reports Database Schema Mismatch Analysis
**Date**: November 7, 2025  
**Status**: CRITICAL - Multiple reports querying non-existent tables

## Executive Summary
The reports module is querying tables that either don't exist or are empty in the actual PostgreSQL database. This is causing all reports to fail with "column does not exist" errors.

## Database Schema Reality

### Existing Tables with Data:
1. **`inventory_items`** (6 rows) - Main product catalog
   - Primary key: `id` (integer)
   - Contains: sku, name, description, category, base_price

2. **`inventory_batches`** (5 rows) - Batch/lot tracking
   - Foreign key: `inventory_item_id` → `inventory_items.id` (integer)
   - Contains: batch_number, quantity, remaining_quantity, unit_cost, expiry_date, received_date

3. **`transactions`** (31 rows) - Sales transactions
   - Primary key: `id` (string)
   - Contains: customer_id, subtotal, tax, total, payment_method, payment_status, created_at

4. **`transaction_items`** (55 rows) - Sales line items
   - Foreign key: `transaction_id` → `transactions.id` (string)
   - Foreign key: `inventory_item_id` → `inventory_items.id` (integer)
   - Contains: name, sku, price, quantity, discount

5. **`goods_receipts`** - Purchase order receipts
   - Primary key: `id` (UUID)
   - Foreign key: `purchase_order_id` (UUID)

6. **`goods_receipt_items`** - GR line items
   - Links to goods_receipts

7. **`customers`** - Customer records

8. **`suppliers`** - Supplier records

9. **`payments`** - Payment records

### Empty/Unused Tables:
1. **`products`** (0 rows) - UUID-based product table (NOT USED)
2. **`stock_movements`** (0 rows) - References `product_id` (UUID) which links to empty `products` table

### Non-Existent Tables (Referenced in Code):
1. **`sales`** - Does NOT exist (should be `transactions`)
2. **`sale_items`** - Does NOT exist (should be `transaction_items`)

## Report-by-Report Analysis

### ✅ Report 1: INVENTORY_VALUATION
**Status**: CORRECT (after our fixes)
- Queries: `inventory_batches`, `inventory_items`
- Uses: `inventory_item_id` correctly
- **Result**: Should work

### ❌ Report 2: SALES_REPORT
**Status**: BROKEN
- **Queries**: `sales` (doesn't exist), `sale_items` (doesn't exist)
- **Should query**: `transactions`, `transaction_items`
- **Line**: 229 in reportsRepository.ts
```sql
FROM sales s
INNER JOIN sale_items si ON si.sale_id = s.id
```
**Fix needed**:
```sql
FROM transactions s
INNER JOIN transaction_items si ON si.transaction_id = s.id
```

### ✅ Report 3: EXPIRING_ITEMS
**Status**: CORRECT
- Queries: `inventory_batches`, `inventory_items`
- Uses: `inventory_item_id` correctly
- **Result**: Should work

### ✅ Report 4: LOW_STOCK / INVENTORY_POSITION
**Status**: PARTIALLY CORRECT
- Queries: `inventory_items`
- **Issue**: Tries to join with `stock_movements` which is empty
- **Note**: `stock_movements` references `product_id` (UUID) but should reference `inventory_item_id` (integer)

### ❌ Report 5: BEST_SELLING_PRODUCTS
**Status**: BROKEN
- **Queries**: `sale_items` (doesn't exist), `sales` (doesn't exist)
- **Should query**: `transaction_items`, `transactions`
- **Line**: 442 in reportsRepository.ts
```sql
FROM sale_items si
INNER JOIN sales s ON s.id = si.sale_id
```
**Fix needed**:
```sql
FROM transaction_items si
INNER JOIN transactions s ON s.id = si.transaction_id
```

### ❌ Report 6: SUPPLIER_COST_ANALYSIS
**Status**: UNKNOWN (need to check if goods_receipts structure matches)
- Queries: `goods_receipt_items`, `goods_receipts`, `suppliers`
- Need to verify column names match

### ❌ Report 7: GOODS_RECEIVED
**Status**: UNKNOWN (need to check schema)
- Queries: `goods_receipts`, `goods_receipt_items`
- Need to verify column names and relationships

### ❌ Report 8: PAYMENT_REPORT  
**Status**: BROKEN
- **Queries**: `sales` (doesn't exist)
- **Should query**: `transactions` + `payments` table
- **Line**: 616, 740

### ❌ Report 9: CUSTOMER_PAYMENTS
**Status**: BROKEN  
- **Queries**: `sales` (doesn't exist)
- **Should query**: `transactions`, `payments`, `customers`

### ❌ Report 10: PROFIT_LOSS
**Status**: BROKEN
- **Queries**: `sales` (doesn't exist)
- **Should query**: `transactions`, `transaction_items`

### ✅ Report 11: DELETED_ITEMS
**Status**: CORRECT
- Queries: `inventory_items` with `is_active = false`
- **Result**: Should work

### ⚠️ Report 12: INVENTORY_ADJUSTMENTS
**Status**: PROBLEMATIC
- Queries: `stock_movements`, `inventory_items`
- **Issue**: `stock_movements` table is EMPTY and uses wrong FK (`product_id` UUID instead of `inventory_item_id` integer)

## Critical Schema Mismatches

### Mismatch #1: Sales Tables
**Code expects**:
- `sales` table with columns: id, sale_date, customer_id, total_amount
- `sale_items` table with columns: sale_id, product_id, quantity, line_total, unit_cost

**Database has**:
- `transactions` table with columns: id, created_at, customer_id, total
- `transaction_items` table with columns: transaction_id, inventory_item_id, quantity, price

### Mismatch #2: Product References
**Code uses**: `product_id` (expecting UUID from `products` table)
**Database has**: `inventory_item_id` (integer from `inventory_items` table)

### Mismatch #3: Stock Movements
**Code expects**: `stock_movements.product_id` to link to products
**Database has**: 
- `stock_movements.product_id` (UUID) → links to empty `products` table
- Should use `inventory_item_id` to link to `inventory_items`

### Mismatch #4: Date Columns
**Code expects**: `sale_date`, `movement_date`
**Database has**: `created_at` timestamps

## Required Fixes

### HIGH PRIORITY (Blocking 6+ reports):
1. **Replace all `sales` → `transactions`**
2. **Replace all `sale_items` → `transaction_items`**
3. **Replace all `si.sale_id` → `si.transaction_id`**
4. **Replace all `s.sale_date` → `s.created_at`**
5. **Replace all `si.product_id` → `si.inventory_item_id`**
6. **Replace all `s.total_amount` → `s.total`**
7. **Replace all `si.line_total` → `si.price * si.quantity`** (if line_total doesn't exist)

### MEDIUM PRIORITY:
8. **Fix stock_movements** to use `inventory_item_id` instead of `product_id`
9. **Verify goods_receipt schema** matches code expectations

### LOW PRIORITY:
10. Consider migrating `inventory_items` → `products` OR removing unused `products` table

## Data Verification Queries

```sql
-- Verify transaction structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'transactions' 
ORDER BY ordinal_position;

-- Verify transaction_items structure  
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'transaction_items'
ORDER BY ordinal_position;

-- Check sample data
SELECT id, created_at, total, payment_method 
FROM transactions 
LIMIT 3;

SELECT transaction_id, inventory_item_id, name, quantity, price
FROM transaction_items
LIMIT 3;
```

## Action Plan

1. ✅ Update inventory reports (DONE)
2. ❌ Update all sales-related reports (IN PROGRESS)
3. ❌ Update stock movement reports
4. ❌ Verify goods receipt reports
5. ❌ Test all 12 reports end-to-end

## Impact Assessment

**Currently Broken**: 8 out of 12 reports (67%)
**Currently Working**: 2 out of 12 reports (17%)
**Unknown/Partial**: 2 out of 12 reports (17%)

This explains why the inventory valuation report kept failing - the code was updated but other modules weren't, and the fundamental table name mismatches weren't addressed.
