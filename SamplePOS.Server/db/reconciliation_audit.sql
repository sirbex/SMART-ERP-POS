-- ============================================================
-- ACCOUNTING RECONCILIATION AUDIT
-- Compares CurrentBalance in accounts against ledger_entries
-- ============================================================

\echo '=== 1. BALANCE DISCREPANCIES (CurrentBalance vs ledger_entries sum) ==='
SELECT
  a."AccountCode",
  a."AccountName",
  a."AccountType",
  a."NormalBalance",
  a."CurrentBalance"                                                                            AS stored_balance,
  COALESCE(SUM(CASE WHEN le."Type" = 'DEBIT' THEN le."Amount" ELSE -le."Amount" END), 0)       AS computed_balance,
  a."CurrentBalance" - COALESCE(SUM(CASE WHEN le."Type" = 'DEBIT' THEN le."Amount" ELSE -le."Amount" END), 0) AS discrepancy
FROM accounts a
LEFT JOIN ledger_entries le ON le."AccountId" = a."Id"
GROUP BY a."Id", a."AccountCode", a."AccountName", a."AccountType", a."NormalBalance", a."CurrentBalance"
HAVING ABS(
  a."CurrentBalance" - COALESCE(SUM(CASE WHEN le."Type" = 'DEBIT' THEN le."Amount" ELSE -le."Amount" END), 0)
) > 0.01
ORDER BY ABS(
  a."CurrentBalance" - COALESCE(SUM(CASE WHEN le."Type" = 'DEBIT' THEN le."Amount" ELSE -le."Amount" END), 0)
) DESC
LIMIT 30;

\echo ''
\echo '=== 2. UNBALANCED JOURNAL ENTRIES (debits != credits within a transaction) ==='
SELECT
  lt."Id"          AS transaction_id,
  lt."Reference"   AS reference,
  lt."Description" AS description,
  lt."TransactionDate"::text AS date,
  SUM(CASE WHEN le."Type" = 'DEBIT'  THEN le."Amount" ELSE 0 END) AS total_debits,
  SUM(CASE WHEN le."Type" = 'CREDIT' THEN le."Amount" ELSE 0 END) AS total_credits,
  SUM(CASE WHEN le."Type" = 'DEBIT'  THEN le."Amount" ELSE 0 END)
  - SUM(CASE WHEN le."Type" = 'CREDIT' THEN le."Amount" ELSE 0 END) AS imbalance
FROM ledger_transactions lt
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
GROUP BY lt."Id", lt."Reference", lt."Description", lt."TransactionDate"
HAVING ABS(
  SUM(CASE WHEN le."Type" = 'DEBIT'  THEN le."Amount" ELSE 0 END)
  - SUM(CASE WHEN le."Type" = 'CREDIT' THEN le."Amount" ELSE 0 END)
) > 0.01
ORDER BY ABS(
  SUM(CASE WHEN le."Type" = 'DEBIT'  THEN le."Amount" ELSE 0 END)
  - SUM(CASE WHEN le."Type" = 'CREDIT' THEN le."Amount" ELSE 0 END)
) DESC
LIMIT 30;

\echo ''
\echo '=== 3. ORPHANED LEDGER ENTRIES (no matching transaction) ==='
SELECT COUNT(*) AS orphaned_entries
FROM ledger_entries le
WHERE NOT EXISTS (
  SELECT 1 FROM ledger_transactions lt WHERE lt."Id" = le."TransactionId"
);

\echo ''
\echo '=== 4. ACCOUNTING EQUATION CHECK (Assets = Liabilities + Equity) ==='
SELECT
  ROUND(SUM(CASE WHEN a."AccountType" IN ('ASSET')                            THEN
      CASE WHEN a."NormalBalance" = 'DEBIT' THEN a."CurrentBalance" ELSE -a."CurrentBalance" END
    ELSE 0 END), 2) AS total_assets,
  ROUND(SUM(CASE WHEN a."AccountType" IN ('LIABILITY')                        THEN
      CASE WHEN a."NormalBalance" = 'CREDIT' THEN a."CurrentBalance" ELSE -a."CurrentBalance" END
    ELSE 0 END), 2) AS total_liabilities,
  ROUND(SUM(CASE WHEN a."AccountType" IN ('EQUITY')                           THEN
      CASE WHEN a."NormalBalance" = 'CREDIT' THEN a."CurrentBalance" ELSE -a."CurrentBalance" END
    ELSE 0 END), 2) AS total_equity,
  ROUND(SUM(CASE WHEN a."AccountType" IN ('REVENUE')                          THEN
      CASE WHEN a."NormalBalance" = 'CREDIT' THEN a."CurrentBalance" ELSE -a."CurrentBalance" END
    ELSE 0 END), 2) AS total_revenue,
  ROUND(SUM(CASE WHEN a."AccountType" IN ('EXPENSE', 'COST_OF_GOODS_SOLD')   THEN
      CASE WHEN a."NormalBalance" = 'DEBIT' THEN a."CurrentBalance" ELSE -a."CurrentBalance" END
    ELSE 0 END), 2) AS total_expenses
FROM accounts a
WHERE a."IsActive" = true;

\echo ''
\echo '=== 5. NET TRIAL BALANCE (sum of all debit normals minus credit normals should = 0) ==='
SELECT
  ROUND(SUM(
    CASE WHEN a."NormalBalance" = 'DEBIT'  THEN  a."CurrentBalance"
         WHEN a."NormalBalance" = 'CREDIT' THEN -a."CurrentBalance"
    END
  ), 2) AS trial_balance_net
FROM accounts a
WHERE a."IsActive" = true;

\echo ''
\echo '=== 6. PERIOD BALANCE DRIFT (gl_period_balances vs ledger_entries aggregated) ==='
SELECT
  pb.period_year,
  pb.period_month,
  a."AccountCode",
  a."AccountName",
  pb.ending_balance                                                                      AS period_stored,
  COALESCE(SUM(CASE WHEN le."Type" = 'DEBIT' THEN le."Amount" ELSE -le."Amount" END), 0) AS period_computed,
  pb.ending_balance
    - COALESCE(SUM(CASE WHEN le."Type" = 'DEBIT' THEN le."Amount" ELSE -le."Amount" END), 0) AS drift
FROM gl_period_balances pb
JOIN accounts a ON a."Id" = pb.account_id
LEFT JOIN ledger_entries le
  ON le."AccountId" = pb.account_id
  AND EXTRACT(YEAR  FROM le."Date") = pb.period_year
  AND EXTRACT(MONTH FROM le."Date") = pb.period_month
GROUP BY pb.period_year, pb.period_month, a."AccountCode", a."AccountName", pb.ending_balance
HAVING ABS(
  pb.ending_balance
  - COALESCE(SUM(CASE WHEN le."Type" = 'DEBIT' THEN le."Amount" ELSE -le."Amount" END), 0)
) > 0.01
ORDER BY ABS(
  pb.ending_balance
  - COALESCE(SUM(CASE WHEN le."Type" = 'DEBIT' THEN le."Amount" ELSE -le."Amount" END), 0)
) DESC
LIMIT 30;

\echo ''
\echo '=== 7. DUPLICATE IDEMPOTENCY KEYS (double-posted entries) ==='
SELECT
  lt."IdempotencyKey",
  COUNT(*) AS count,
  SUM(le."Amount") AS total_amount
FROM ledger_transactions lt
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
WHERE lt."IdempotencyKey" IS NOT NULL
GROUP BY lt."IdempotencyKey"
HAVING COUNT(DISTINCT lt."Id") > 1
ORDER BY COUNT(*) DESC
LIMIT 20;
