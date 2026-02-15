-- ============================================================================
-- GHOST TRANSACTION DETECTION SCRIPT
-- Detects orphaned/incomplete transactions that need attention
-- ============================================================================

-- 1. Ghost Sales (sales without GL entries)
SELECT 
    'Ghost Sales (no GL entry)' as issue_type,
    COUNT(*) as count
FROM sales s
WHERE NOT EXISTS (
    SELECT 1 FROM ledger_transactions lt 
    WHERE lt."ReferenceType" = 'SALE' 
      AND lt."ReferenceId" = s.id
)
AND s.status = 'COMPLETED'
AND s.sale_date >= '2025-01-01';

-- 2. Ghost Invoices (invoices without GL entries)
SELECT 
    'Ghost Invoices (no GL entry)' as issue_type,
    COUNT(*) as count
FROM invoices i
WHERE NOT EXISTS (
    SELECT 1 FROM ledger_transactions lt 
    WHERE lt."ReferenceType" = 'INVOICE' 
      AND lt."ReferenceId" = i."Id"
)
AND i."Status" IN ('ISSUED', 'PARTIAL', 'PAID');

-- 3. Orphaned Quotations (converted_to_sale_id references non-existent sale)
SELECT 
    'Orphaned Quotations (converted_to_sale_id invalid)' as issue_type,
    COUNT(*) as count
FROM quotations q
WHERE q.converted_to_sale_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM sales s WHERE s.id = q.converted_to_sale_id
);

-- 4. Sales missing inventory movement
SELECT 
    'Sales missing stock movement' as issue_type,
    COUNT(*) as count
FROM sales s
WHERE NOT EXISTS (
    SELECT 1 FROM stock_movements sm 
    WHERE sm.reference_id = s.id 
      AND sm.reference_type = 'SALE'
)
AND s.status = 'COMPLETED'
AND s.sale_date >= '2025-01-01';

-- 5. Invoice payments without GL entries
SELECT 
    'Invoice Payments (no GL entry)' as issue_type,
    COUNT(*) as count
FROM invoice_payments ip
WHERE NOT EXISTS (
    SELECT 1 FROM ledger_transactions lt 
    WHERE lt."ReferenceType" = 'INVOICE_PAYMENT' 
      AND lt."ReferenceId" = ip.id
);

-- 6. Unbalanced ledger transactions
SELECT 
    'Unbalanced Ledger Transactions' as issue_type,
    COUNT(*) as count
FROM ledger_transactions lt
WHERE lt."TotalDebitAmount" != lt."TotalCreditAmount"
  AND lt."IsReversed" = FALSE;

-- 7. Ledger entries without matching transaction
SELECT 
    'Orphaned Ledger Entries' as issue_type,
    COUNT(*) as count
FROM ledger_entries le
WHERE NOT EXISTS (
    SELECT 1 FROM ledger_transactions lt 
    WHERE lt."Id" = le."LedgerTransactionId"
);

-- Summary
SELECT '=== INTEGRITY CHECK COMPLETE ===' as status;
