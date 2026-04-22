-- ============================================================
-- ACCOUNTING RECONCILIATION AUDIT v2 — correct column names
-- ledger_entries: EntryType, DebitAmount, CreditAmount, EntryDate
-- ledger_transactions: IdempotencyKey, ReferenceNumber
-- ============================================================

\echo '=== 1. BALANCE DISCREPANCIES (CurrentBalance vs ledger_entries) ==='
SELECT
  a."AccountCode",
  a."AccountName",
  a."AccountType",
  a."NormalBalance",
  a."CurrentBalance"                                                        AS stored_balance,
  COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)               AS net_activity,
  a."CurrentBalance" - COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS discrepancy
FROM accounts a
LEFT JOIN ledger_entries le ON le."AccountId" = a."Id"
GROUP BY a."Id", a."AccountCode", a."AccountName", a."AccountType", a."NormalBalance", a."CurrentBalance"
HAVING ABS(
  a."CurrentBalance" - COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
) > 0.01
ORDER BY ABS(
  a."CurrentBalance" - COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
) DESC
LIMIT 30;

\echo ''
\echo '=== 2. UNBALANCED JOURNAL ENTRIES (debits != credits within a transaction) ==='
SELECT
  lt."Id"              AS transaction_id,
  lt."ReferenceNumber" AS reference,
  lt."Description"     AS description,
  lt."TransactionDate"::date::text AS date,
  lt."TotalDebitAmount",
  lt."TotalCreditAmount",
  lt."TotalDebitAmount" - lt."TotalCreditAmount" AS header_imbalance,
  SUM(le."DebitAmount")  AS entry_debits,
  SUM(le."CreditAmount") AS entry_credits,
  SUM(le."DebitAmount") - SUM(le."CreditAmount") AS entry_imbalance
FROM ledger_transactions lt
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
WHERE lt."Status" = 'POSTED'
GROUP BY lt."Id", lt."ReferenceNumber", lt."Description", lt."TransactionDate",
         lt."TotalDebitAmount", lt."TotalCreditAmount"
HAVING ABS(SUM(le."DebitAmount") - SUM(le."CreditAmount")) > 0.01
ORDER BY ABS(SUM(le."DebitAmount") - SUM(le."CreditAmount")) DESC
LIMIT 30;

\echo ''
\echo '=== 3. HEADER TOTAL MISMATCH (TotalDebit/Credit vs line items) ==='
SELECT
  lt."Id"              AS transaction_id,
  lt."ReferenceNumber",
  lt."TotalDebitAmount"         AS header_debit,
  lt."TotalCreditAmount"        AS header_credit,
  SUM(le."DebitAmount")         AS lines_debit,
  SUM(le."CreditAmount")        AS lines_credit,
  lt."TotalDebitAmount"  - SUM(le."DebitAmount")  AS debit_drift,
  lt."TotalCreditAmount" - SUM(le."CreditAmount") AS credit_drift
FROM ledger_transactions lt
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
WHERE lt."Status" = 'POSTED'
GROUP BY lt."Id", lt."ReferenceNumber", lt."TotalDebitAmount", lt."TotalCreditAmount"
HAVING ABS(lt."TotalDebitAmount" - SUM(le."DebitAmount")) > 0.01
    OR ABS(lt."TotalCreditAmount" - SUM(le."CreditAmount")) > 0.01
ORDER BY ABS(lt."TotalDebitAmount" - SUM(le."DebitAmount")) DESC
LIMIT 20;

\echo ''
\echo '=== 4. ORPHANED LEDGER ENTRIES ==='
SELECT COUNT(*) AS orphaned_entries
FROM ledger_entries le
WHERE NOT EXISTS (
  SELECT 1 FROM ledger_transactions lt WHERE lt."Id" = le."TransactionId"
);

\echo ''
\echo '=== 5. ACCOUNTING EQUATION — assets / liabilities / equity / revenue / expense ==='
SELECT
  ROUND(SUM(CASE WHEN a."AccountType" = 'ASSET'                THEN a."CurrentBalance" ELSE 0 END), 2) AS total_assets,
  ROUND(SUM(CASE WHEN a."AccountType" = 'LIABILITY'            THEN a."CurrentBalance" ELSE 0 END), 2) AS total_liabilities,
  ROUND(SUM(CASE WHEN a."AccountType" = 'EQUITY'               THEN a."CurrentBalance" ELSE 0 END), 2) AS total_equity,
  ROUND(SUM(CASE WHEN a."AccountType" = 'REVENUE'              THEN a."CurrentBalance" ELSE 0 END), 2) AS total_revenue,
  ROUND(SUM(CASE WHEN a."AccountType" IN ('EXPENSE','COST_OF_GOODS_SOLD') THEN a."CurrentBalance" ELSE 0 END), 2) AS total_expenses,
  ROUND(SUM(CASE WHEN a."AccountType" = 'ASSET'                THEN a."CurrentBalance" ELSE 0 END)
      - ROUND(SUM(CASE WHEN a."AccountType" IN ('LIABILITY','EQUITY','REVENUE') THEN a."CurrentBalance" ELSE 0 END), 2)
      + ROUND(SUM(CASE WHEN a."AccountType" IN ('EXPENSE','COST_OF_GOODS_SOLD') THEN a."CurrentBalance" ELSE 0 END), 2)
  , 2) AS net_equation_diff
FROM accounts a
WHERE a."IsActive" = true;

\echo ''
\echo '=== 6. NET TRIAL BALANCE (net of all CurrentBalance — should be 0) ==='
-- Debit-normal: CurrentBalance is positive when balance is on the natural side
-- Credit-normal: CurrentBalance is positive when balance is on the natural side
-- So: Assets+Expenses (debit-normal) should equal Liabilities+Equity+Revenue (credit-normal)
SELECT
  ROUND(SUM(CASE WHEN a."NormalBalance" = 'DEBIT'  THEN  a."CurrentBalance" ELSE 0 END), 2) AS total_debit_normal,
  ROUND(SUM(CASE WHEN a."NormalBalance" = 'CREDIT' THEN  a."CurrentBalance" ELSE 0 END), 2) AS total_credit_normal,
  ROUND(SUM(CASE WHEN a."NormalBalance" = 'DEBIT'  THEN  a."CurrentBalance" ELSE 0 END), 2)
- ROUND(SUM(CASE WHEN a."NormalBalance" = 'CREDIT' THEN  a."CurrentBalance" ELSE 0 END), 2) AS trial_balance_diff
FROM accounts a
WHERE a."IsActive" = true;

\echo ''
\echo '=== 7. ACCOUNTS WITH ABNORMAL BALANCE (balance on wrong side) ==='
SELECT
  a."AccountCode", a."AccountName", a."AccountType", a."NormalBalance",
  a."CurrentBalance"
FROM accounts a
WHERE a."IsActive" = true
  AND a."CurrentBalance" < -0.01
ORDER BY a."CurrentBalance" ASC
LIMIT 20;

\echo ''
\echo '=== 8. DUPLICATE IDEMPOTENCY KEYS ==='
SELECT
  lt."IdempotencyKey",
  COUNT(DISTINCT lt."Id") AS transaction_count,
  MIN(lt."CreatedAt")::date::text AS first_posted,
  MAX(lt."CreatedAt")::date::text AS last_posted
FROM ledger_transactions lt
WHERE lt."IdempotencyKey" IS NOT NULL
GROUP BY lt."IdempotencyKey"
HAVING COUNT(DISTINCT lt."Id") > 1
ORDER BY COUNT(DISTINCT lt."Id") DESC
LIMIT 20;

\echo ''
\echo '=== 9. TOTAL POSTED ACTIVITY SUMMARY ==='
SELECT
  COUNT(DISTINCT lt."Id")  AS total_transactions,
  COUNT(le."Id")            AS total_entries,
  SUM(le."DebitAmount")     AS total_debits_posted,
  SUM(le."CreditAmount")    AS total_credits_posted,
  SUM(le."DebitAmount") - SUM(le."CreditAmount") AS net_imbalance
FROM ledger_transactions lt
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
WHERE lt."Status" = 'POSTED';
