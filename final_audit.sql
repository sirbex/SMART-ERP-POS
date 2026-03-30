-- ============================================================================
-- FINAL ENTERPRISE AUDIT - COMPREHENSIVE VERIFICATION
-- Run after all fixes to confirm system-wide data integrity
-- ============================================================================

-- ============================================================================
-- 1. DOUBLE-ENTRY BALANCE (every transaction must have debits = credits)
-- ============================================================================
\echo '=== CHECK 1: DOUBLE-ENTRY BALANCE ==='
SELECT le.transaction_id,
       SUM(le.debit) AS total_debit,
       SUM(le.credit) AS total_credit,
       SUM(le.debit) - SUM(le.credit) AS imbalance
FROM ledger_entries le
GROUP BY le.transaction_id
HAVING ABS(SUM(le.debit) - SUM(le.credit)) > 0.01;

-- ============================================================================
-- 2. TRIAL BALANCE (total debits = total credits across all accounts)
-- ============================================================================
\echo '=== CHECK 2: TRIAL BALANCE ==='
SELECT SUM(debit) AS total_debits,
       SUM(credit) AS total_credits,
       SUM(debit) - SUM(credit) AS net_difference
FROM ledger_entries;

-- ============================================================================
-- 3. ACCOUNT BALANCE DRIFT (CurrentBalance must match ledger entries)
-- ============================================================================
\echo '=== CHECK 3: ACCOUNT BALANCE DRIFT ==='
SELECT a.account_code, a.account_name,
       a."CurrentBalance" AS stored_balance,
       COALESCE(calc.computed_balance, 0) AS computed_balance,
       a."CurrentBalance" - COALESCE(calc.computed_balance, 0) AS drift
FROM accounts a
LEFT JOIN (
  SELECT account_id,
         SUM(CASE WHEN a2.normal_balance = 'DEBIT' THEN debit - credit ELSE credit - debit END) AS computed_balance
  FROM ledger_entries le
  JOIN accounts a2 ON a2.id = le.account_id
  GROUP BY account_id
) calc ON calc.account_id = a.id
WHERE ABS(a."CurrentBalance" - COALESCE(calc.computed_balance, 0)) > 0.01;

-- ============================================================================
-- 4. ORPHAN LEDGER ENTRIES (entries without valid account)
-- ============================================================================
\echo '=== CHECK 4: ORPHAN LEDGER ENTRIES ==='
SELECT le.id, le.transaction_id, le.debit, le.credit
FROM ledger_entries le
LEFT JOIN accounts a ON a.id = le.account_id
WHERE a.id IS NULL;

-- ============================================================================
-- 5. ORPHAN TRANSACTIONS (transactions with no entries)
-- ============================================================================
\echo '=== CHECK 5: ORPHAN TRANSACTIONS ==='
SELECT t.transaction_number, t.description, t.transaction_date
FROM transactions t
LEFT JOIN ledger_entries le ON le.transaction_id = t.id
WHERE le.id IS NULL;

-- ============================================================================
-- 6. GLOBAL DEBITS = CREDITS
-- ============================================================================
\echo '=== CHECK 6: GLOBAL DEBITS = CREDITS ==='
SELECT SUM(debit) AS all_debits,
       SUM(credit) AS all_credits,
       SUM(debit) - SUM(credit) AS global_difference
FROM ledger_entries;

-- ============================================================================
-- 7. PAYROLL GL LINKAGE (all payroll entries have valid GL transactions)
-- ============================================================================
\echo '=== CHECK 7: PAYROLL GL LINKAGE ==='
SELECT pe."Id", pe."EmployeeName", pe."NetPay", pe."JournalTransactionNumber"
FROM payroll_entries pe
WHERE pe."JournalTransactionNumber" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM transactions t WHERE t.transaction_number = pe."JournalTransactionNumber"
  );

-- ============================================================================
-- 8. PAYROLL MATH (NetPay = BasicSalary + Allowances - Deductions)
-- ============================================================================
\echo '=== CHECK 8: PAYROLL MATH ==='
SELECT pe."Id", pe."EmployeeName",
       pe."BasicSalary", pe."Allowances", pe."Deductions", pe."NetPay",
       pe."BasicSalary" + pe."Allowances" - pe."Deductions" AS expected_net,
       pe."NetPay" - (pe."BasicSalary" + pe."Allowances" - pe."Deductions") AS diff
FROM payroll_entries pe
WHERE ABS(pe."NetPay" - (pe."BasicSalary" + pe."Allowances" - pe."Deductions")) > 0.01;

-- ============================================================================
-- 9. SALES PROFIT MATH (profit = total_amount - total_cost)
-- ============================================================================
\echo '=== CHECK 9: SALES PROFIT MATH ==='
SELECT sale_number, total_amount, total_cost, profit,
       total_amount - total_cost AS expected_profit,
       profit - (total_amount - total_cost) AS diff
FROM sales
WHERE ABS(profit - (total_amount - total_cost)) > 0.01
  AND status = 'COMPLETED';

-- ============================================================================
-- 10. PRODUCT STOCK vs BATCH CONSISTENCY
-- ============================================================================
\echo '=== CHECK 10: PRODUCT STOCK vs BATCH CONSISTENCY ==='
SELECT p.name, p.quantity_on_hand AS product_qty,
       COALESCE(b.batch_qty, 0) AS batch_qty,
       p.quantity_on_hand - COALESCE(b.batch_qty, 0) AS drift
FROM products p
LEFT JOIN (
  SELECT product_id, SUM(remaining_quantity) AS batch_qty
  FROM product_batches
  WHERE remaining_quantity > 0
  GROUP BY product_id
) b ON b.product_id = p.id
WHERE ABS(p.quantity_on_hand - COALESCE(b.batch_qty, 0)) > 0.01;

-- ============================================================================
-- 11. NEGATIVE BATCH QUANTITIES
-- ============================================================================
\echo '=== CHECK 11: NEGATIVE BATCH QUANTITIES ==='
SELECT pb.id, p.name, pb.batch_number, pb.remaining_quantity
FROM product_batches pb
JOIN products p ON p.id = pb.product_id
WHERE pb.remaining_quantity < 0;

-- ============================================================================
-- 12. SELF-REFERENCING ACCOUNTS
-- ============================================================================
\echo '=== CHECK 12: SELF-REFERENCING ACCOUNTS ==='
SELECT account_code, account_name
FROM accounts
WHERE "ParentAccountId" = id;

-- ============================================================================
-- 13. DUPLICATE DETECTION
-- ============================================================================
\echo '=== CHECK 13a: DUPLICATE ACCOUNT CODES ==='
SELECT account_code, COUNT(*) FROM accounts GROUP BY account_code HAVING COUNT(*) > 1;

\echo '=== CHECK 13b: DUPLICATE SALE NUMBERS ==='
SELECT sale_number, COUNT(*) FROM sales GROUP BY sale_number HAVING COUNT(*) > 1;

\echo '=== CHECK 13c: DUPLICATE TRANSACTION NUMBERS ==='
SELECT transaction_number, COUNT(*) FROM transactions GROUP BY transaction_number HAVING COUNT(*) > 1;

\echo '=== CHECK 13d: DUPLICATE INVOICE NUMBERS ==='
SELECT "InvoiceNumber", COUNT(*) FROM invoices GROUP BY "InvoiceNumber" HAVING COUNT(*) > 1;

-- ============================================================================
-- 14. CUSTOMER BALANCE vs INVOICES
-- ============================================================================
\echo '=== CHECK 14: CUSTOMER BALANCE vs INVOICES ==='
SELECT c.name, c.balance AS stored_balance,
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
WHERE ABS(c.balance - COALESCE(inv.invoice_balance, 0)) > 0.01;

-- ============================================================================
-- 15. EMPLOYEE SUB-LEDGER ACCOUNTS
-- ============================================================================
\echo '=== CHECK 15: EMPLOYEES WITHOUT SUB-LEDGER ==='
SELECT e."Id", e."FirstName" || ' ' || e."LastName" AS name
FROM employees e
WHERE e."LedgerAccountId" IS NULL AND e."Status" = 'Active';

-- ============================================================================
-- 16. INVOICE PAYMENT CONSISTENCY
-- ============================================================================
\echo '=== CHECK 16: INVOICE PAYMENT SUM vs AmountPaid ==='
SELECT i."InvoiceNumber",
       i."AmountPaid" AS invoice_paid,
       COALESCE(p.total_payments, 0) AS payment_sum,
       i."AmountPaid" - COALESCE(p.total_payments, 0) AS diff
FROM invoices i
LEFT JOIN (
  SELECT invoice_id, SUM(amount) AS total_payments
  FROM invoice_payments
  WHERE status != 'Cancelled'
  GROUP BY invoice_id
) p ON p.invoice_id = i."Id"
WHERE ABS(i."AmountPaid" - COALESCE(p.total_payments, 0)) > 0.01
  AND i."Status" NOT IN ('Cancelled', 'Voided');

-- ============================================================================
-- 17. PAYROLL PERIOD TOTALS (each period should have equal period totals)
-- ============================================================================
\echo '=== CHECK 17: PAYROLL PERIOD TOTALS ==='
SELECT pe."PayPeriod", 
       COUNT(*) AS entry_count,
       SUM(pe."NetPay") AS total_net_pay
FROM payroll_entries pe
WHERE pe."Status" = 'POSTED'
GROUP BY pe."PayPeriod"
ORDER BY pe."PayPeriod";

-- ============================================================================
-- 18. INVOICE STATUS CONSISTENCY
-- ============================================================================
\echo '=== CHECK 18: INVOICE STATUS ANOMALIES ==='
SELECT "InvoiceNumber", "Status", "TotalAmount", "AmountPaid", "OutstandingBalance",
       CASE
         WHEN "Status" = 'Paid' AND "OutstandingBalance" > 0.01 THEN 'PAID BUT HAS BALANCE'
         WHEN "Status" = 'Unpaid' AND "AmountPaid" > 0.01 THEN 'UNPAID BUT HAS PAYMENT'
         WHEN "Status" = 'PartiallyPaid' AND "AmountPaid" <= 0.01 THEN 'PARTIAL BUT NO PAYMENT'
         WHEN "Status" = 'PartiallyPaid' AND "OutstandingBalance" <= 0.01 THEN 'PARTIAL BUT FULLY PAID'
         WHEN ABS("TotalAmount" - "AmountPaid" - "OutstandingBalance") > 0.01 THEN 'AMOUNT MISMATCH'
         ELSE 'OK'
       END AS issue
FROM invoices
WHERE "Status" NOT IN ('Cancelled', 'Voided')
HAVING CASE
         WHEN "Status" = 'Paid' AND "OutstandingBalance" > 0.01 THEN TRUE
         WHEN "Status" = 'Unpaid' AND "AmountPaid" > 0.01 THEN TRUE
         WHEN "Status" = 'PartiallyPaid' AND "AmountPaid" <= 0.01 THEN TRUE
         WHEN "Status" = 'PartiallyPaid' AND "OutstandingBalance" <= 0.01 THEN TRUE
         WHEN ABS("TotalAmount" - "AmountPaid" - "OutstandingBalance") > 0.01 THEN TRUE
         ELSE FALSE
       END;

-- ============================================================================
-- SUMMARY
-- ============================================================================
\echo ''
\echo '=========================================='
\echo ' ENTERPRISE AUDIT COMPLETE'
\echo ' Checks 1-18 executed'
\echo ' Any output above indicates issues'
\echo ' Empty results = PASS'
\echo '=========================================='
