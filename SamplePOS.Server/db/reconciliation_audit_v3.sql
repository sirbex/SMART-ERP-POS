-- ============================================================
-- RECONCILIATION AUDIT v3 — NormalBalance-aware formula
-- Formula: DEBIT-normal: stored = SUM(DebitAmount) - SUM(CreditAmount)
--          CREDIT-normal: stored = SUM(CreditAmount) - SUM(DebitAmount)
-- ============================================================

\echo '=== REAL BALANCE DISCREPANCIES (NormalBalance-aware) ==='
SELECT
  a."AccountCode",
  a."AccountName",
  a."AccountType",
  a."NormalBalance",
  a."CurrentBalance"                                                                       AS stored_balance,
  CASE WHEN a."NormalBalance" = 'DEBIT'
    THEN COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    ELSE COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)
  END                                                                                       AS correct_balance,
  a."CurrentBalance" - CASE WHEN a."NormalBalance" = 'DEBIT'
    THEN COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    ELSE COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)
  END                                                                                       AS discrepancy
FROM accounts a
LEFT JOIN ledger_entries le ON le."AccountId" = a."Id"
GROUP BY a."Id", a."AccountCode", a."AccountName", a."AccountType", a."NormalBalance", a."CurrentBalance"
HAVING ABS(
  a."CurrentBalance" - CASE WHEN a."NormalBalance" = 'DEBIT'
    THEN COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    ELSE COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)
  END
) > 0.01
ORDER BY ABS(
  a."CurrentBalance" - CASE WHEN a."NormalBalance" = 'DEBIT'
    THEN COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    ELSE COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)
  END
) DESC;

\echo ''
\echo '=== TRIAL BALANCE NET (should be 0) ==='
SELECT
  ROUND(SUM(CASE WHEN a."NormalBalance" = 'DEBIT'
      THEN COALESCE(le_sum.net_debit_balance, 0)
      ELSE COALESCE(le_sum.net_credit_balance, 0)
    END), 2) AS correct_trial_balance
FROM accounts a
LEFT JOIN (
  SELECT "AccountId",
    SUM("DebitAmount") - SUM("CreditAmount") AS net_debit_balance,
    SUM("CreditAmount") - SUM("DebitAmount") AS net_credit_balance
  FROM ledger_entries
  GROUP BY "AccountId"
) le_sum ON le_sum."AccountId" = a."Id"
WHERE a."IsActive" = true;

\echo ''
\echo '=== ACCOUNTING EQUATION FROM LEDGER ENTRIES ==='
SELECT
  ROUND(SUM(CASE WHEN a."AccountType" = 'ASSET' AND a."NormalBalance" = 'DEBIT'
      THEN COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) ELSE 0 END), 2) AS assets,
  ROUND(SUM(CASE WHEN a."AccountType" = 'LIABILITY' AND a."NormalBalance" = 'CREDIT'
      THEN COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) ELSE 0 END), 2) AS liabilities,
  ROUND(SUM(CASE WHEN a."AccountType" = 'EQUITY' AND a."NormalBalance" = 'CREDIT'
      THEN COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) ELSE 0 END), 2) AS equity,
  ROUND(SUM(CASE WHEN a."AccountType" = 'REVENUE' AND a."NormalBalance" = 'CREDIT'
      THEN COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) ELSE 0 END), 2) AS revenue,
  ROUND(SUM(CASE WHEN a."AccountType" IN ('EXPENSE','COST_OF_GOODS_SOLD') AND a."NormalBalance" = 'DEBIT'
      THEN COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) ELSE 0 END), 2) AS expenses
FROM accounts a
LEFT JOIN ledger_entries le ON le."AccountId" = a."Id"
WHERE a."IsActive" = true
GROUP BY true;
