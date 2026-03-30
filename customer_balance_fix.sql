-- ============================================================================
-- CUSTOMER BALANCE RECONCILIATION
-- Canonical formula (BR-INV-003): balance = SUM(invoices.OutstandingBalance)
-- WHERE Status NOT IN ('Cancelled','Voided','Draft')
-- ============================================================================

\echo '=== 1. CURRENT CUSTOMER BALANCES (non-zero) ==='
SELECT id, name, balance,
       COALESCE(credit_limit, 0) AS credit_limit
FROM customers
WHERE balance != 0
ORDER BY name;

\echo '=== 2. INVOICE-DERIVED BALANCES (canonical formula) ==='
SELECT c.id, c.name,
       c.balance AS stored_balance,
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
WHERE c.balance != 0 OR inv.invoice_balance IS NOT NULL
ORDER BY c.name;

\echo '=== 3. ALL INVOICES FOR CUSTOMERS WITH NON-ZERO BALANCE ==='
SELECT c.name AS customer_name,
       i."InvoiceNumber",
       i."Status",
       i."TotalAmount",
       i."AmountPaid",
       i."OutstandingBalance",
       i."CreatedAt"::date AS created_date
FROM invoices i
JOIN customers c ON c.id = i."CustomerId"
WHERE c.balance != 0
ORDER BY c.name, i."CreatedAt";

\echo '=== 4. CREDIT SALES FOR CUSTOMERS WITH NON-ZERO BALANCE ==='
SELECT c.name AS customer_name,
       s.sale_number,
       s.total_amount,
       s.amount_paid,
       s.payment_method,
       s.status,
       s.created_at::date AS sale_date
FROM sales s
JOIN customers c ON c.id = s.customer_id
WHERE c.balance != 0
  AND s.payment_method = 'CREDIT'
ORDER BY c.name, s.created_at;

\echo '=== 5. CUSTOMER PAYMENTS TABLE ==='
SELECT c.name AS customer_name,
       cp."Amount",
       cp."PaymentMethod",
       cp."Status",
       cp."CreatedAt"::date
FROM customer_payments cp
JOIN customers c ON c.id = cp."CustomerId"
WHERE c.balance != 0
ORDER BY c.name;

\echo '=== 6. ALL SALES FOR CUSTOMERS WITH NON-ZERO BALANCE (any method) ==='
SELECT c.name AS customer_name,
       s.sale_number,
       s.total_amount,
       s.amount_paid,
       s.payment_method,
       s.status,
       s.created_at::date AS sale_date
FROM sales s
JOIN customers c ON c.id = s.customer_id
WHERE c.balance != 0
ORDER BY c.name, s.created_at;

\echo '=== 7. CUSTOMER BALANCE AUDIT TRAIL ==='
SELECT c.name AS customer_name,
       a."OldBalance",
       a."NewBalance",
       a."ChangeAmount",
       a."Source",
       a."CreatedAt"::timestamp(0) AS audit_ts
FROM customer_balance_audit a
JOIN customers c ON c.id = a."CustomerId"
WHERE c.balance != 0
ORDER BY c.name, a."CreatedAt" DESC
LIMIT 50;
