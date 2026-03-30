-- ============================================================================
-- FIX: Invoice data quality issues
-- Two invoices linked to fully-paid non-credit sales have incorrect status
-- ============================================================================
BEGIN;

-- 1. INV-2026-0001 (zaman zam zam): MOBILE_MONEY sale fully paid 82K
--    Invoice shows Unpaid/82K outstanding - should be Paid/0
\echo 'Fixing INV-2026-0001 (zaman zam zam - fully paid MOBILE_MONEY sale)...'
UPDATE invoices
SET "Status" = 'Paid',
    "AmountPaid" = "TotalAmount",
    "OutstandingBalance" = 0,
    "UpdatedAt" = NOW()
WHERE "InvoiceNumber" = 'INV-2026-0001'
  AND "Status" = 'Unpaid';

-- 2. INV-2026-0006 (Mutumba Daude): CASH sale overpaid (100K on 79K)
--    Invoice shows Draft/79K outstanding - should be Paid/0
\echo 'Fixing INV-2026-0006 (Mutumba Daude - overpaid CASH sale)...'
UPDATE invoices
SET "Status" = 'Paid',
    "AmountPaid" = "TotalAmount",
    "OutstandingBalance" = 0,
    "UpdatedAt" = NOW()
WHERE "InvoiceNumber" = 'INV-2026-0006'
  AND "Status" = 'Draft';

-- 3. Recalculate customer balances using canonical formula (BR-INV-003)
\echo 'Recalculating customer balances from invoice data...'
UPDATE customers c
SET balance = COALESCE(inv.total_outstanding, 0)
FROM (
  SELECT "CustomerId",
         SUM("OutstandingBalance") AS total_outstanding
  FROM invoices
  WHERE "Status" NOT IN ('Cancelled', 'Voided', 'Draft')
  GROUP BY "CustomerId"
) inv
WHERE c.id = inv."CustomerId"
  AND c.balance != COALESCE(inv.total_outstanding, 0);

-- Also zero out customers that have no active invoices but had balance
UPDATE customers c
SET balance = 0
WHERE c.balance != 0
  AND NOT EXISTS (
    SELECT 1 FROM invoices i
    WHERE i."CustomerId" = c.id
      AND i."Status" NOT IN ('Cancelled', 'Voided', 'Draft')
      AND i."OutstandingBalance" > 0
  );

-- 4. Verify results
\echo '=== VERIFICATION: Customer balances after fix ==='
SELECT c.name, c.balance AS new_balance,
       COALESCE(inv.invoice_balance, 0) AS invoice_balance,
       c.balance - COALESCE(inv.invoice_balance, 0) AS discrepancy
FROM customers c
LEFT JOIN (
  SELECT "CustomerId",
         SUM("OutstandingBalance") AS invoice_balance
  FROM invoices
  WHERE "Status" NOT IN ('Cancelled', 'Voided', 'Draft')
  GROUP BY "CustomerId"
) inv ON inv."CustomerId" = c.id
WHERE c.balance != 0 OR COALESCE(inv.invoice_balance, 0) != 0
ORDER BY c.name;

\echo '=== VERIFICATION: Fixed invoices ==='
SELECT "InvoiceNumber", "Status", "TotalAmount", "AmountPaid", "OutstandingBalance"
FROM invoices
WHERE "InvoiceNumber" IN ('INV-2026-0001', 'INV-2026-0006');

COMMIT;
\echo 'FIX COMPLETE.'
