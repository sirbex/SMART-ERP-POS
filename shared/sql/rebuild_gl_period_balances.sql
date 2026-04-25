-- =============================================================================
-- GL PERIOD BALANCES RECONCILIATION & REPAIR
-- =============================================================================
-- Purpose : Detect and fix gl_period_balances rows that don't match the
--           actual debit/credit sums in ledger_entries.
--
-- Safe to run on any tenant DB.  All repairs are wrapped in a transaction
-- so the script is fully atomic.  If any discrepancy is found it will be
-- printed, fixed, and verified within the same transaction.
--
-- Usage:
--   docker exec -i smarterp-postgres psql -U postgres -d <tenant_db> \
--       < /tmp/rebuild_gl_period_balances.sql
--
-- Tenant DBs:
--   pos_system
--   pos_tenant_henber_pharmacy
--   pos_tenant_acme_store
--   pos_tenant_blis
--   pos_tenant_dynamics  (already fixed 2026-04)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- STEP 1: Show current drift (diagnosis)
-- ---------------------------------------------------------------------------
\echo '=== DIAGNOSIS: accounts where gl_period_balances != ledger_entries sums ==='

SELECT
    a."AccountCode"                                 AS account_code,
    a."AccountName"                                 AS account_name,
    gpb.fiscal_year,
    gpb.fiscal_period,
    gpb.debit_total                                 AS gpb_debit,
    gpb.credit_total                                AS gpb_credit,
    gpb.running_balance                             AS gpb_running,
    COALESCE(le_agg.actual_debit,  0)               AS le_debit,
    COALESCE(le_agg.actual_credit, 0)               AS le_credit,
    COALESCE(le_agg.actual_debit, 0)
        - COALESCE(le_agg.actual_credit, 0)         AS le_running,
    -- delta: positive = gpb overstated
    gpb.debit_total  - COALESCE(le_agg.actual_debit,  0) AS drift_debit,
    gpb.credit_total - COALESCE(le_agg.actual_credit, 0) AS drift_credit
FROM gl_period_balances gpb
JOIN accounts a ON a."Id" = gpb.account_id
LEFT JOIN (
    SELECT
        a2."Id"                            AS account_id,
        EXTRACT(YEAR  FROM le."EntryDate") AS fiscal_year,
        EXTRACT(MONTH FROM le."EntryDate") AS fiscal_period,
        SUM(CASE WHEN le."EntryType" = 'DEBIT'  THEN le."Amount" ELSE 0 END) AS actual_debit,
        SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END) AS actual_credit
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a2 ON a2."Id" = le."AccountId"
    WHERE lt."Status" != 'VOIDED'
    GROUP BY a2."Id", fiscal_year, fiscal_period
) le_agg ON le_agg.account_id  = gpb.account_id
        AND le_agg.fiscal_year  = gpb.fiscal_year
        AND le_agg.fiscal_period = gpb.fiscal_period
WHERE
    ABS(gpb.debit_total  - COALESCE(le_agg.actual_debit,  0)) > 0.01
 OR ABS(gpb.credit_total - COALESCE(le_agg.actual_credit, 0)) > 0.01
ORDER BY gpb.fiscal_year, gpb.fiscal_period, a."AccountCode";

-- ---------------------------------------------------------------------------
-- STEP 2: Show gl_period_balances rows with NO matching ledger_entries
--         (stale rows for periods with zero real activity)
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== STALE gl_period_balances rows (no ledger_entries for this account+period) ==='

SELECT
    a."AccountCode"  AS account_code,
    a."AccountName"  AS account_name,
    gpb.fiscal_year,
    gpb.fiscal_period,
    gpb.debit_total,
    gpb.credit_total,
    gpb.running_balance
FROM gl_period_balances gpb
JOIN accounts a ON a."Id" = gpb.account_id
WHERE NOT EXISTS (
    SELECT 1
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    WHERE le."AccountId" = gpb.account_id
      AND EXTRACT(YEAR  FROM le."EntryDate") = gpb.fiscal_year
      AND EXTRACT(MONTH FROM le."EntryDate") = gpb.fiscal_period
      AND lt."Status" != 'VOIDED'
)
AND (gpb.debit_total != 0 OR gpb.credit_total != 0)
ORDER BY gpb.fiscal_year, gpb.fiscal_period, a."AccountCode";

-- ---------------------------------------------------------------------------
-- STEP 3: REPAIR — delete stale rows (zero real activity in that period)
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== REPAIR STEP 3: deleting stale gl_period_balances rows ==='

DELETE FROM gl_period_balances gpb
WHERE NOT EXISTS (
    SELECT 1
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    WHERE le."AccountId" = gpb.account_id
      AND EXTRACT(YEAR  FROM le."EntryDate") = gpb.fiscal_year
      AND EXTRACT(MONTH FROM le."EntryDate") = gpb.fiscal_period
      AND lt."Status" != 'VOIDED'
)
AND (gpb.debit_total != 0 OR gpb.credit_total != 0);

-- ---------------------------------------------------------------------------
-- STEP 4: REPAIR — rebuild all remaining rows from ledger_entries ground truth
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== REPAIR STEP 4: rebuilding gl_period_balances from ledger_entries ==='

-- Rebuild every account × period that has real ledger_entries (upsert)
INSERT INTO gl_period_balances (
    account_id,
    fiscal_year,
    fiscal_period,
    debit_total,
    credit_total,
    running_balance,
    last_updated
)
SELECT
    le."AccountId"                                                           AS account_id,
    EXTRACT(YEAR  FROM le."EntryDate")                                       AS fiscal_year,
    EXTRACT(MONTH FROM le."EntryDate")                                       AS fiscal_period,
    SUM(CASE WHEN le."EntryType" = 'DEBIT'  THEN le."Amount" ELSE 0 END)    AS debit_total,
    SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END)    AS credit_total,
    SUM(CASE WHEN le."EntryType" = 'DEBIT'  THEN le."Amount" ELSE 0 END)
  - SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END)    AS running_balance,
    NOW()
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
WHERE lt."Status" != 'VOIDED'
GROUP BY le."AccountId",
         EXTRACT(YEAR  FROM le."EntryDate"),
         EXTRACT(MONTH FROM le."EntryDate")
ON CONFLICT (account_id, fiscal_year, fiscal_period)
DO UPDATE SET
    debit_total     = EXCLUDED.debit_total,
    credit_total    = EXCLUDED.credit_total,
    running_balance = EXCLUDED.running_balance,
    last_updated    = NOW();

-- ---------------------------------------------------------------------------
-- STEP 5: VERIFY — no drift should remain after repair
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== VERIFY: drift remaining after repair (should be EMPTY) ==='

SELECT
    a."AccountCode"  AS account_code,
    a."AccountName"  AS account_name,
    gpb.fiscal_year,
    gpb.fiscal_period,
    gpb.debit_total  - COALESCE(le_agg.actual_debit,  0) AS residual_debit_drift,
    gpb.credit_total - COALESCE(le_agg.actual_credit, 0) AS residual_credit_drift
FROM gl_period_balances gpb
JOIN accounts a ON a."Id" = gpb.account_id
LEFT JOIN (
    SELECT
        le."AccountId"                             AS account_id,
        EXTRACT(YEAR  FROM le."EntryDate")         AS fiscal_year,
        EXTRACT(MONTH FROM le."EntryDate")         AS fiscal_period,
        SUM(CASE WHEN le."EntryType" = 'DEBIT'  THEN le."Amount" ELSE 0 END) AS actual_debit,
        SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END) AS actual_credit
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    WHERE lt."Status" != 'VOIDED'
    GROUP BY le."AccountId", fiscal_year, fiscal_period
) le_agg ON le_agg.account_id   = gpb.account_id
        AND le_agg.fiscal_year  = gpb.fiscal_year
        AND le_agg.fiscal_period = gpb.fiscal_period
WHERE
    ABS(gpb.debit_total  - COALESCE(le_agg.actual_debit,  0)) > 0.01
 OR ABS(gpb.credit_total - COALESCE(le_agg.actual_credit, 0)) > 0.01;

-- ---------------------------------------------------------------------------
-- STEP 6: VERIFY CHECK CONSTRAINT — running_balance must equal debit-credit
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== VERIFY: CHECK constraint (running_balance = debit_total - credit_total) ==='

SELECT COUNT(*) AS constraint_violations
FROM gl_period_balances
WHERE ABS(running_balance - (debit_total - credit_total)) > 0.01;

COMMIT;

\echo ''
\echo '=== DONE. If both verify queries returned 0 rows / constraint_violations=0, the DB is clean. ==='
