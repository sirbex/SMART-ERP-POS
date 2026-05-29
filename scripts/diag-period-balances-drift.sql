-- Period balance drift: compare WRONG (all entries) vs CORRECT (net-active POSTED)
-- Run against tenant DB, e.g. pos_tenant_henber_pharmacy

\echo '=== A) FALSE POSITIVE drift (all ledger_entries — old integrity check) ==='
WITH ledger_all AS (
  SELECT
    le."AccountId" AS account_id,
    EXTRACT(YEAR FROM lt."TransactionDate" AT TIME ZONE 'UTC')::INT AS fiscal_year,
    EXTRACT(MONTH FROM lt."TransactionDate" AT TIME ZONE 'UTC')::INT AS fiscal_period,
    COALESCE(SUM(le."DebitAmount"), 0) AS le_debits,
    COALESCE(SUM(le."CreditAmount"), 0) AS le_credits
  FROM ledger_entries le
  JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
  GROUP BY 1, 2, 3
),
ledger_net AS (
  SELECT
    le."AccountId" AS account_id,
    EXTRACT(YEAR FROM lt."TransactionDate" AT TIME ZONE 'UTC')::INT AS fiscal_year,
    EXTRACT(MONTH FROM lt."TransactionDate" AT TIME ZONE 'UTC')::INT AS fiscal_period,
    COALESCE(SUM(le."DebitAmount"), 0) AS le_debits,
    COALESCE(SUM(le."CreditAmount"), 0) AS le_credits
  FROM ledger_entries le
  JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
  WHERE lt."Status" = 'POSTED'
    AND lt."IsReversed" = FALSE
    AND lt."Id" NOT IN (
      SELECT "ReversedByTransactionId" FROM ledger_transactions
      WHERE "ReversedByTransactionId" IS NOT NULL
    )
  GROUP BY 1, 2, 3
)
SELECT a."AccountCode",
       la.fiscal_year,
       la.fiscal_period,
       (la.le_debits - COALESCE(gpb.debit_total, 0)) AS all_vs_gpb_debit_drift,
       (ln.le_debits - COALESCE(gpb.debit_total, 0)) AS net_vs_gpb_debit_drift
FROM ledger_all la
JOIN accounts a ON a."Id" = la.account_id
LEFT JOIN gl_period_balances gpb
  ON gpb.account_id = la.account_id
 AND gpb.fiscal_year = la.fiscal_year
 AND gpb.fiscal_period = la.fiscal_period
LEFT JOIN ledger_net ln
  ON ln.account_id = la.account_id
 AND ln.fiscal_year = la.fiscal_year
 AND ln.fiscal_period = la.fiscal_period
WHERE la.fiscal_period BETWEEN 1 AND 12
  AND (
    ABS(la.le_debits - COALESCE(gpb.debit_total, 0)) > 0.01
    OR ABS(la.le_credits - COALESCE(gpb.credit_total, 0)) > 0.01
  )
ORDER BY ABS(la.le_debits - COALESCE(gpb.debit_total, 0)) DESC
LIMIT 20;

\echo ''
\echo '=== B) TRUE drift (net-active vs gpb) — needs rebuild if non-zero ==='
WITH ledger_net AS (
  SELECT
    le."AccountId" AS account_id,
    EXTRACT(YEAR FROM lt."TransactionDate" AT TIME ZONE 'UTC')::INT AS fiscal_year,
    EXTRACT(MONTH FROM lt."TransactionDate" AT TIME ZONE 'UTC')::INT AS fiscal_period,
    COALESCE(SUM(le."DebitAmount"), 0) AS le_debits,
    COALESCE(SUM(le."CreditAmount"), 0) AS le_credits
  FROM ledger_entries le
  JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
  WHERE lt."Status" = 'POSTED'
    AND lt."IsReversed" = FALSE
    AND lt."Id" NOT IN (
      SELECT "ReversedByTransactionId" FROM ledger_transactions
      WHERE "ReversedByTransactionId" IS NOT NULL
    )
  GROUP BY 1, 2, 3
)
SELECT a."AccountCode", a."AccountName",
       ln.fiscal_year, ln.fiscal_period,
       ln.le_debits, ln.le_credits,
       gpb.debit_total, gpb.credit_total,
       ln.le_debits - COALESCE(gpb.debit_total, 0) AS debit_drift,
       ln.le_credits - COALESCE(gpb.credit_total, 0) AS credit_drift
FROM ledger_net ln
FULL OUTER JOIN gl_period_balances gpb
  ON gpb.account_id = ln.account_id
 AND gpb.fiscal_year = ln.fiscal_year
 AND gpb.fiscal_period = ln.fiscal_period
JOIN accounts a ON a."Id" = COALESCE(ln.account_id, gpb.account_id)
WHERE gpb.fiscal_period BETWEEN 1 AND 12
  AND (
    ABS(COALESCE(ln.le_debits, 0) - COALESCE(gpb.debit_total, 0)) > 0.01
    OR ABS(COALESCE(ln.le_credits, 0) - COALESCE(gpb.credit_total, 0)) > 0.01
  )
ORDER BY 3, 4, 1;

\echo ''
\echo '=== C) gl_projection_events backlog ==='
SELECT status, COUNT(*) FROM gl_projection_events GROUP BY status ORDER BY 1;
