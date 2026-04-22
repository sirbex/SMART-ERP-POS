-- ============================================================
-- CASH (1010) DEEP INVESTIGATION
-- ============================================================

\echo '=== 1. Cash GL breakdown by transaction status and entry type ==='
SELECT
  lt."Status",
  le."EntryType",
  COUNT(*) as entry_count,
  SUM(le."DebitAmount") as total_debit,
  SUM(le."CreditAmount") as total_credit,
  SUM(le."DebitAmount") - SUM(le."CreditAmount") as net
FROM ledger_entries le
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1010'
GROUP BY lt."Status", le."EntryType"
ORDER BY lt."Status", le."EntryType";

\echo '=== 2. Top 20 largest CREDIT entries against Cash (cash going OUT) ==='
SELECT
  lt."TransactionNumber",
  lt."TransactionDate",
  lt."ReferenceNumber",
  le."CreditAmount",
  le."Description",
  lt."Status"
FROM ledger_entries le
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1010'
  AND le."CreditAmount" > 0
ORDER BY le."CreditAmount" DESC
LIMIT 20;

\echo '=== 3. Top 20 largest DEBIT entries against Cash (cash coming IN) ==='
SELECT
  lt."TransactionNumber",
  lt."TransactionDate",
  lt."ReferenceNumber",
  le."DebitAmount",
  le."Description",
  lt."Status"
FROM ledger_entries le
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1010'
  AND le."DebitAmount" > 0
ORDER BY le."DebitAmount" DESC
LIMIT 20;

\echo '=== 4. Cash entries grouped by source (PostingSource if available) ==='
SELECT
  lt."ReferenceNumber",
  SUBSTRING(lt."ReferenceNumber", 1, 10) as ref_prefix,
  COUNT(*) as count,
  SUM(le."DebitAmount") as total_debit,
  SUM(le."CreditAmount") as total_credit,
  SUM(le."DebitAmount") - SUM(le."CreditAmount") as net
FROM ledger_entries le
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1010'
  AND lt."Status" = 'POSTED'
GROUP BY lt."ReferenceNumber", SUBSTRING(lt."ReferenceNumber", 1, 10)
ORDER BY ABS(SUM(le."DebitAmount") - SUM(le."CreditAmount")) DESC
LIMIT 30;

\echo '=== 5. Cash net by month (where is the drift? ==='
SELECT
  DATE_TRUNC('month', lt."TransactionDate") as month,
  SUM(le."DebitAmount") as debit,
  SUM(le."CreditAmount") as credit,
  SUM(le."DebitAmount") - SUM(le."CreditAmount") as net_for_month,
  SUM(SUM(le."DebitAmount") - SUM(le."CreditAmount")) OVER (ORDER BY DATE_TRUNC('month', lt."TransactionDate")) as running_balance
FROM ledger_entries le
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1010'
  AND lt."Status" = 'POSTED'
GROUP BY DATE_TRUNC('month', lt."TransactionDate")
ORDER BY month;

\echo '=== 6. invoice_payments CASH total (the subledger the page uses) ==='
SELECT
  payment_method,
  COUNT(*) as count,
  SUM(amount) as total
FROM invoice_payments
WHERE UPPER(payment_method) = 'CASH'
GROUP BY payment_method;

\echo '=== 7. All payment methods in invoice_payments ==='
SELECT
  payment_method,
  COUNT(*) as count,
  SUM(amount) as total
FROM invoice_payments
GROUP BY payment_method
ORDER BY total DESC;

\echo '=== 8. sales table cash totals ==='
SELECT
  payment_method,
  COUNT(*) as count,
  SUM(total_amount) as total_sales,
  SUM(amount_paid) as total_paid
FROM sales
WHERE UPPER(payment_method) = 'CASH'
  AND status = 'COMPLETED'
GROUP BY payment_method;

\echo '=== 9. What the GL says cash received vs where it SHOULD come from ==='
SELECT
  'GL Cash Debits (receipts)' as source,
  COUNT(*) as count,
  SUM(le."DebitAmount") as amount
FROM ledger_entries le
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1010'
  AND le."DebitAmount" > 0
  AND lt."Status" = 'POSTED'
UNION ALL
SELECT
  'GL Cash Credits (payments out)' as source,
  COUNT(*),
  SUM(le."CreditAmount")
FROM ledger_entries le
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1010'
  AND le."CreditAmount" > 0
  AND lt."Status" = 'POSTED'
UNION ALL
SELECT 'sales table (CASH, COMPLETED)', COUNT(*), SUM(total_amount)
FROM sales WHERE UPPER(payment_method) = 'CASH' AND status = 'COMPLETED'
UNION ALL
SELECT 'invoice_payments (all cash)', COUNT(*), SUM(amount)
FROM invoice_payments WHERE UPPER(payment_method) = 'CASH';

\echo '=== 10. SALES that posted to GL - check if sale amounts match GL debits ==='
SELECT
  s.sale_number,
  s.total_amount as sale_total,
  s.payment_method,
  lt."TotalDebitAmount" as gl_debit,
  lt."TotalCreditAmount" as gl_credit,
  lt."TransactionDate",
  lt."Status"
FROM sales s
JOIN ledger_transactions lt ON lt."ReferenceNumber" = s.sale_number
WHERE UPPER(s.payment_method) = 'CASH'
  AND s.status = 'COMPLETED'
ORDER BY s.total_amount DESC
LIMIT 20;
