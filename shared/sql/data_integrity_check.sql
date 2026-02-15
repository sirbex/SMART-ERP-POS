-- ============================================================================
-- DATA INTEGRITY CHECK SCRIPT
-- ============================================================================
-- Purpose: Verify data consistency, accuracy, precision, and clarity
-- Run this periodically to detect any data management issues
-- 
-- Principles:
--   1. CONSISTENCY - Related data must always match
--   2. ACCURACY - Values must reflect actual transactions
--   3. PRECISION - Use NUMERIC(18,6) for financial calculations
--   4. CLARITY - Single source of truth for each data point
-- ============================================================================

\echo '=============================================='
\echo 'DATA INTEGRITY CHECK - Starting...'
\echo '=============================================='

-- ============================================================================
-- 1. ACCOUNTS PAYABLE CONSISTENCY
-- ============================================================================
\echo ''
\echo '1. ACCOUNTS PAYABLE CONSISTENCY'
\echo '--------------------------------'

SELECT 
    CASE 
        WHEN ABS(gl_balance - supplier_sum) < 0.01 THEN '[PASS]'
        ELSE '[FAIL] - Difference: ' || (gl_balance - supplier_sum)::text
    END as status,
    gl_balance as "GL Account 2100",
    supplier_sum as "Suppliers Sum"
FROM (
    SELECT 
        (SELECT COALESCE("CurrentBalance", 0) FROM accounts WHERE "AccountCode" = '2100') as gl_balance,
        (SELECT COALESCE(SUM("OutstandingBalance"), 0) FROM suppliers WHERE "IsActive" = true) as supplier_sum
) t;

-- Detailed supplier balance verification
SELECT 
    s."CompanyName",
    s."OutstandingBalance" as stored_balance,
    COALESCE(inv_sum.outstanding, 0) as calculated_from_invoices,
    s."OutstandingBalance" - COALESCE(inv_sum.outstanding, 0) as discrepancy
FROM suppliers s
LEFT JOIN (
    SELECT 
        "SupplierId",
        SUM("OutstandingBalance") as outstanding
    FROM supplier_invoices
    WHERE "Status" NOT IN ('Cancelled', 'Voided', 'DELETED')
      AND deleted_at IS NULL
    GROUP BY "SupplierId"
) inv_sum ON inv_sum."SupplierId" = s."Id"
WHERE s."IsActive" = true
  AND ABS(s."OutstandingBalance" - COALESCE(inv_sum.outstanding, 0)) > 0.01;

-- ============================================================================
-- 2. ACCOUNTS RECEIVABLE CONSISTENCY
-- ============================================================================
\echo ''
\echo '2. ACCOUNTS RECEIVABLE CONSISTENCY'
\echo '-----------------------------------'

SELECT 
    CASE 
        WHEN ABS(gl_balance - customer_sum) < 0.01 THEN '[PASS]'
        ELSE '[FAIL] - Difference: ' || (gl_balance - customer_sum)::text
    END as status,
    gl_balance as "GL Account 1200",
    customer_sum as "Customers Sum"
FROM (
    SELECT 
        (SELECT COALESCE("CurrentBalance", 0) FROM accounts WHERE "AccountCode" = '1200') as gl_balance,
        (SELECT COALESCE(SUM(balance), 0) FROM customers WHERE is_active = true) as customer_sum
) t;

-- ============================================================================
-- 3. INVENTORY CONSISTENCY
-- ============================================================================
\echo ''
\echo '3. INVENTORY CONSISTENCY'
\echo '------------------------'

-- Product stock vs cost layer sum
SELECT 
    p.name as product_name,
    p.quantity_on_hand as product_stock,
    COALESCE(layer_sum.total, 0) as cost_layer_total,
    p.quantity_on_hand - COALESCE(layer_sum.total, 0) as discrepancy
FROM products p
LEFT JOIN (
    SELECT 
        product_id,
        SUM(remaining_quantity) as total
    FROM cost_layers
    WHERE remaining_quantity > 0
    GROUP BY product_id
) layer_sum ON layer_sum.product_id = p.id
WHERE p.is_active = true
  AND ABS(p.quantity_on_hand - COALESCE(layer_sum.total, 0)) > 0.001
LIMIT 10;

-- ============================================================================
-- 4. INVOICE/PAYMENT CONSISTENCY
-- ============================================================================
\echo ''
\echo '4. SUPPLIER INVOICE PAYMENT CONSISTENCY'
\echo '---------------------------------------'

-- Supplier invoices with incorrect outstanding balance
SELECT 
    "SupplierInvoiceNumber" as invoice_number,
    "TotalAmount" as total,
    "AmountPaid" as paid,
    "OutstandingBalance" as stored_outstanding,
    ("TotalAmount" - "AmountPaid") as calculated_outstanding,
    "OutstandingBalance" - ("TotalAmount" - "AmountPaid") as discrepancy
FROM supplier_invoices
WHERE deleted_at IS NULL
  AND ABS("OutstandingBalance" - ("TotalAmount" - "AmountPaid")) > 0.01
LIMIT 10;

-- ============================================================================
-- 5. LEDGER BALANCE CONSISTENCY
-- ============================================================================
\echo ''
\echo '5. LEDGER BALANCE CONSISTENCY'
\echo '-----------------------------'

-- Check debits = credits for posted transactions
SELECT 
    CASE 
        WHEN ABS(total_debits - total_credits) < 0.01 THEN '[PASS] - Balanced'
        ELSE '[FAIL] - Imbalance: ' || (total_debits - total_credits)::text
    END as status,
    total_debits,
    total_credits
FROM (
    SELECT 
        COALESCE(SUM("DebitAmount"), 0) as total_debits,
        COALESCE(SUM("CreditAmount"), 0) as total_credits
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."LedgerTransactionId" = lt."Id"
    WHERE lt."Status" = 'POSTED'
) t;

-- ============================================================================
-- 6. DATA PRECISION CHECK
-- ============================================================================
\echo ''
\echo '6. DATA PRECISION CHECK'
\echo '-----------------------'

-- Check for floating point precision issues (values with many decimal places)
SELECT 
    'supplier_invoices' as table_name,
    COUNT(*) as rows_with_precision_issues
FROM supplier_invoices
WHERE deleted_at IS NULL
  AND (
    "TotalAmount"::text LIKE '%.%[0-9][0-9][0-9][0-9][0-9][0-9][0-9]%'
    OR "OutstandingBalance"::text LIKE '%.%[0-9][0-9][0-9][0-9][0-9][0-9][0-9]%'
  );

-- ============================================================================
-- 7. ORPHANED RECORDS CHECK
-- ============================================================================
\echo ''
\echo '7. ORPHANED RECORDS CHECK'
\echo '-------------------------'

-- Goods receipt items without valid goods receipt
SELECT 
    'goods_receipt_items without parent' as issue,
    COUNT(*) as count
FROM goods_receipt_items gri
WHERE NOT EXISTS (
    SELECT 1 FROM goods_receipts gr WHERE gr.id = gri.goods_receipt_id
);

-- Supplier invoices with invalid supplier
SELECT 
    'supplier_invoices with invalid supplier' as issue,
    COUNT(*) as count
FROM supplier_invoices si
WHERE si.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM suppliers s WHERE s."Id" = si."SupplierId"
);

-- ============================================================================
-- SUMMARY
-- ============================================================================
\echo ''
\echo '=============================================='
\echo 'DATA INTEGRITY CHECK - Complete'
\echo '=============================================='
\echo 'Review any FAIL or non-zero discrepancy results above.'
\echo 'Run: psql -U postgres -d pos_system -f data_integrity_check.sql'
