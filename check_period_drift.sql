-- Check current state of gl_period_balances vs ledger_entries for Apr 2026
-- to know exactly what needs to be updated

SELECT
  a."AccountCode",
  a."AccountName",
  gpb.fiscal_year,
  gpb.fiscal_period,
  -- What gl_period_balances currently shows
  gpb.debit_total   AS gpb_debit,
  gpb.credit_total  AS gpb_credit,
  -- What POSTED ledger_entries actually show
  COALESCE(le.le_dr, 0) AS ledger_dr,
  COALESCE(le.le_cr, 0) AS ledger_cr,
  -- Drift
  gpb.debit_total  - COALESCE(le.le_dr, 0) AS dr_drift,
  gpb.credit_total - COALESCE(le.le_cr, 0) AS cr_drift
FROM gl_period_balances gpb
JOIN accounts a ON a."Id" = gpb.account_id
LEFT JOIN (
  SELECT
    le."AccountId",
    EXTRACT(YEAR  FROM lt."TransactionDate")::INT AS yr,
    EXTRACT(MONTH FROM lt."TransactionDate")::INT AS mo,
    COALESCE(SUM(le."DebitAmount"),  0) AS le_dr,
    COALESCE(SUM(le."CreditAmount"), 0) AS le_cr
  FROM ledger_entries le
  JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
  WHERE lt."Status" = 'POSTED'
  GROUP BY le."AccountId", yr, mo
) le ON le."AccountId" = gpb.account_id
     AND le.yr = gpb.fiscal_year
     AND le.mo = gpb.fiscal_period
WHERE a."AccountCode" IN ('1010','1300','4000','5000','1200')
ORDER BY gpb.fiscal_year, gpb.fiscal_period, a."AccountCode";
