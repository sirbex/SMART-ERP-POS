-- ============================================================
-- Sync gl_period_balances to match ALL-statuses ledger_entries
-- for the 5 accounts/periods that are drifted:
-- 1010 Cash, 1300 Inventory, 4000 Revenue, 5000 COGS — Apr 2026
-- (1200 AR has no drift — skip it)
--
-- All-statuses is the authoritative method (matches accounts.CurrentBalance).
-- REVERSED entries pair with their POSTED reversal counterparts.
-- ============================================================

BEGIN;

UPDATE gl_period_balances gpb
SET
    debit_total     = sub.new_dr,
    credit_total    = sub.new_cr,
    running_balance = sub.new_dr - sub.new_cr,
    last_updated    = NOW()
FROM (
    SELECT
        le."AccountId",
        EXTRACT(YEAR  FROM lt."TransactionDate")::INT AS yr,
        EXTRACT(MONTH FROM lt."TransactionDate")::INT AS mo,
        COALESCE(SUM(le."DebitAmount"),  0) AS new_dr,
        COALESCE(SUM(le."CreditAmount"), 0) AS new_cr
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" IN ('1010', '1300', '4000', '5000')
    GROUP BY le."AccountId",
             EXTRACT(YEAR  FROM lt."TransactionDate")::INT,
             EXTRACT(MONTH FROM lt."TransactionDate")::INT
) sub
WHERE gpb.account_id    = sub."AccountId"
  AND gpb.fiscal_year   = sub.yr
  AND gpb.fiscal_period = sub.mo;

-- Verify: show resulting drift for all 5 accounts
SELECT
  a."AccountCode",
  a."AccountName",
  gpb.fiscal_year,
  gpb.fiscal_period,
  gpb.debit_total        AS gpb_dr,
  COALESCE(le.le_dr, 0)  AS ledger_dr,
  gpb.credit_total       AS gpb_cr,
  COALESCE(le.le_cr, 0)  AS ledger_cr,
  ROUND(gpb.debit_total  - COALESCE(le.le_dr, 0), 2) AS dr_drift,
  ROUND(gpb.credit_total - COALESCE(le.le_cr, 0), 2) AS cr_drift
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
  GROUP BY le."AccountId", yr, mo
) le ON le."AccountId" = gpb.account_id
     AND le.yr = gpb.fiscal_year
     AND le.mo = gpb.fiscal_period
WHERE a."AccountCode" IN ('1010', '1200', '1300', '4000', '5000')
ORDER BY gpb.fiscal_year, gpb.fiscal_period, a."AccountCode";

COMMIT;
