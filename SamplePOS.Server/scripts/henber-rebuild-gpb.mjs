/**
 * Rebuild gl_period_balances from net-active ledger (fixes Trial Balance after
 * raw CORRECTION posts that skipped AccountingCore GPB upsert).
 */
import pg from 'pg';

const url =
  process.env.HENBER_DATABASE_URL ||
  'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@209.38.203.138:5432/pos_tenant_henber_pharmacy';

const NET = `
  lt."Status" = 'POSTED'
  AND lt."IsReversed" = FALSE
  AND lt."Id" NOT IN (
    SELECT "ReversedByTransactionId" FROM ledger_transactions
    WHERE "ReversedByTransactionId" IS NOT NULL
  )
`;

const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 30000 });
const fmt = (n) => Number(n || 0).toFixed(2);

const client = await pool.connect();
try {
  const before = await client.query(`
    SELECT COALESCE(SUM(debit_total),0)::float8 AS dr,
           COALESCE(SUM(credit_total),0)::float8 AS cr
    FROM gl_period_balances gpb
    JOIN accounts a ON a."Id"=gpb.account_id
    WHERE a."IsActive"=true`);
  console.log('GPB before: DR', fmt(before.rows[0].dr), 'CR', fmt(before.rows[0].cr),
    'Diff', fmt(before.rows[0].dr - before.rows[0].cr));

  await client.query('BEGIN');
  await client.query("SET LOCAL timezone = 'UTC'");

  const upsertRes = await client.query(
    `WITH fresh AS (
       SELECT
         le."AccountId" AS account_id,
         EXTRACT(YEAR  FROM lt."TransactionDate" AT TIME ZONE 'UTC')::INT AS fiscal_year,
         EXTRACT(MONTH FROM lt."TransactionDate" AT TIME ZONE 'UTC')::INT AS fiscal_period,
         COALESCE(SUM(le."DebitAmount"),  0) AS debits,
         COALESCE(SUM(le."CreditAmount"), 0) AS credits
       FROM ledger_entries le
       JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
       WHERE ${NET}
       GROUP BY le."AccountId",
                EXTRACT(YEAR  FROM lt."TransactionDate" AT TIME ZONE 'UTC')::INT,
                EXTRACT(MONTH FROM lt."TransactionDate" AT TIME ZONE 'UTC')::INT
     )
     INSERT INTO gl_period_balances
         (account_id, fiscal_year, fiscal_period,
          debit_total, credit_total, running_balance, last_updated)
     SELECT
         fresh.account_id, fresh.fiscal_year, fresh.fiscal_period,
         fresh.debits, fresh.credits,
         fresh.debits - fresh.credits,
         NOW()
     FROM fresh
     WHERE fresh.fiscal_period BETWEEN 1 AND 12
       AND NOT EXISTS (
         SELECT 1 FROM financial_periods fp
         WHERE fp.period_year  = fresh.fiscal_year
           AND fp.period_month = fresh.fiscal_period
           AND fp."Status" IN ('CLOSED', 'LOCKED')
       )
     ON CONFLICT (account_id, fiscal_year, fiscal_period) DO UPDATE SET
         debit_total     = EXCLUDED.debit_total,
         credit_total    = EXCLUDED.credit_total,
         running_balance = EXCLUDED.running_balance,
         last_updated    = NOW()`,
  );
  console.log('Rows upserted:', upsertRes.rowCount);

  await client.query('COMMIT');

  const after = await client.query(`
    SELECT COALESCE(SUM(debit_total),0)::float8 AS dr,
           COALESCE(SUM(credit_total),0)::float8 AS cr
    FROM gl_period_balances gpb
    JOIN accounts a ON a."Id"=gpb.account_id
    WHERE a."IsActive"=true`);
  console.log('GPB after:  DR', fmt(after.rows[0].dr), 'CR', fmt(after.rows[0].cr),
    'Diff', fmt(after.rows[0].dr - after.rows[0].cr));

  const a2100 = await client.query(`
    SELECT COALESCE(SUM(debit_total),0)::float8 AS dr,
           COALESCE(SUM(credit_total),0)::float8 AS cr
    FROM gl_period_balances gpb
    JOIN accounts a ON a."Id"=gpb.account_id
    WHERE a."AccountCode"='2100'`);
  console.log('2100 GPB: DR', fmt(a2100.rows[0].dr), 'CR', fmt(a2100.rows[0].cr));
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
