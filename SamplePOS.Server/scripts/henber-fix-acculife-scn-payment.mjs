/**
 * Henber — fix ACCULIFE AP double-count: PAY-000600 allocated 35k to SCN-2026-0011
 * (credit note already DR'd 2100). Soft-delete that allocation and post entity-tagged
 * CR 2100 / DR original bank account for 35,000.
 *
 * Usage:
 *   DRY_RUN=1 node scripts/henber-fix-acculife-scn-payment.mjs
 *   DRY_RUN=0 node scripts/henber-fix-acculife-scn-payment.mjs
 */
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const DRY_RUN = process.env.DRY_RUN !== '0';
const url =
  process.env.HENBER_DATABASE_URL ||
  'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@209.38.203.138:5432/pos_tenant_henber_pharmacy';

const PAYMENT_NUMBER = 'PAY-000600';
const SCN_NUMBER = 'SCN-2026-0011';
const AMOUNT = 35000;
const SYSTEM_USER = process.env.SYSTEM_USER_ID || '4971ceff-c094-41b0-bfaf-a3d88ea634a1';

const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 20000 });
const fmt = (n) => Number(n || 0).toFixed(2);

const NET = `
  lt."Status" = 'POSTED'
  AND lt."IsReversed" = FALSE
  AND lt."Id" NOT IN (
    SELECT "ReversedByTransactionId" FROM ledger_transactions
    WHERE "ReversedByTransactionId" IS NOT NULL
  )
`;

try {
  console.log('ACCULIFE SCN payment fix | DRY_RUN=', DRY_RUN);

  const pay = await pool.query(
    `SELECT sp.*, s."CompanyName", s."Id" AS supplier_id
     FROM supplier_payments sp
     JOIN suppliers s ON s."Id"=sp."SupplierId"
     WHERE sp."PaymentNumber"=$1`,
    [PAYMENT_NUMBER],
  );
  const payment = pay.rows[0];
  if (!payment) throw new Error('Payment not found');

  const scn = await pool.query(
    `SELECT * FROM supplier_invoices WHERE "SupplierInvoiceNumber"=$1`,
    [SCN_NUMBER],
  );
  const creditNote = scn.rows[0];
  if (!creditNote) throw new Error('SCN not found');

  const alloc = await pool.query(
    `SELECT * FROM supplier_payment_allocations
     WHERE "PaymentId"=$1 AND "SupplierInvoiceId"=$2 AND deleted_at IS NULL`,
    [payment.Id, creditNote.Id],
  );
  if (!alloc.rows.length) {
    console.log('No active allocation PAY→SCN — already fixed?');
  } else {
    console.log('Allocation to soft-delete:', alloc.rows[0].Id, fmt(alloc.rows[0].AmountAllocated));
  }

  const payJe = await pool.query(
    `SELECT lt."Id" AS txn_id, lt."TransactionNumber",
            a."AccountCode", a."Id" AS account_id,
            le."DebitAmount"::float8 AS dr, le."CreditAmount"::float8 AS cr
     FROM ledger_transactions lt
     JOIN ledger_entries le ON le."TransactionId"=lt."Id"
     JOIN accounts a ON a."Id"=le."AccountId"
     WHERE lt."ReferenceType"='SUPPLIER_PAYMENT' AND lt."ReferenceId"=$1 AND ${NET}
     ORDER BY a."AccountCode"`,
    [payment.Id],
  );
  console.log('Payment JE lines:');
  console.table(payJe.rows.map((r) => ({
    txn: r.TransactionNumber,
    acct: r.AccountCode,
    dr: fmt(r.dr),
    cr: fmt(r.cr),
  })));

  const bankLine = payJe.rows.find((r) => Number(r.cr) > 0);
  if (!bankLine) throw new Error('Could not find bank credit line on payment JE');

  const apAcct = await pool.query(`SELECT "Id" FROM accounts WHERE "AccountCode"='2100'`);
  const apAccountId = apAcct.rows[0].Id;

  const before = await pool.query(
    `SELECT COALESCE(SUM(le."CreditAmount"-le."DebitAmount"),0)::float8 AS gl
     FROM ledger_entries le
     JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
     JOIN accounts a ON a."Id"=le."AccountId"
     WHERE a."AccountCode"='2100' AND le."EntityId"::uuid=$1::uuid AND ${NET}`,
    [payment.supplier_id],
  );
  console.log('ACCULIFE GL 2100 before:', fmt(before.rows[0].gl));

  if (DRY_RUN) {
    console.log('Would: soft-delete allocation, reduce AllocatedAmount by', AMOUNT);
    console.log('Would: post CORRECTION CR 2100', AMOUNT, '/ DR', bankLine.AccountCode, AMOUNT);
    process.exit(0);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (alloc.rows.length) {
      await client.query(
        `UPDATE supplier_payment_allocations SET deleted_at=NOW() WHERE "Id"=$1`,
        [alloc.rows[0].Id],
      );
    }

    await client.query(
      `UPDATE supplier_payments
       SET "AllocatedAmount" = GREATEST(0, COALESCE("AllocatedAmount",0) - $2),
           "UpdatedAt" = NOW()
       WHERE "Id"=$1`,
      [payment.Id, AMOUNT],
    );

    // Next transaction number
    const numRes = await client.query(
      `SELECT COALESCE(MAX(
         CASE WHEN "TransactionNumber" ~ '^TXN-[0-9]+$'
           THEN SUBSTRING("TransactionNumber" FROM 5)::int ELSE 0 END
       ), 0) + 1 AS n FROM ledger_transactions`,
    );
    const txnNumber = `TXN-${String(numRes.rows[0].n).padStart(6, '0')}`;
    const txnId = randomUUID();
    const today = new Date().toISOString().slice(0, 10);

    await client.query(
      `INSERT INTO ledger_transactions (
         "Id", "TransactionNumber", "TransactionDate", "Description",
         "ReferenceType", "ReferenceId", "ReferenceNumber",
         "Status", "IsReversed", "CreatedById", "CreatedAt", "UpdatedAt",
         "TotalDebitAmount", "TotalCreditAmount", "PostingSource"
       ) VALUES (
         $1, $2, $3::date,
         $4, 'CORRECTION', $5, $6,
         'POSTED', FALSE, $7, NOW(), NOW(),
         $8, $8, 'AP_REPAIR'
       )`,
      [
        txnId,
        txnNumber,
        today,
        `Reverse AP double-count: ${PAYMENT_NUMBER} allocated to ${SCN_NUMBER}`,
        payment.Id,
        PAYMENT_NUMBER,
        SYSTEM_USER,
        AMOUNT,
      ],
    );

    // CR 2100 (undo extra AP debit) — entity tagged
    await client.query(
      `INSERT INTO ledger_entries (
         "Id", "TransactionId", "LedgerTransactionId", "AccountId",
         "EntryType", "Amount", "DebitAmount", "CreditAmount",
         "Description", "LineNumber", "EntityType", "EntityId",
         "EntryDate", "CreatedAt", "TransactionCurrency"
       ) VALUES (
         $1, $2, $2, $3,
         'CREDIT', $4, 0, $4,
         $5, 1, 'SUPPLIER', $6,
         $7::date, NOW(), 'UGX'
       )`,
      [
        randomUUID(),
        txnId,
        apAccountId,
        AMOUNT,
        `Undo ${PAYMENT_NUMBER} allocation to ${SCN_NUMBER}`,
        payment.supplier_id,
        today,
      ],
    );

    // DR bank (restore cash side of overstated payment AP)
    await client.query(
      `INSERT INTO ledger_entries (
         "Id", "TransactionId", "LedgerTransactionId", "AccountId",
         "EntryType", "Amount", "DebitAmount", "CreditAmount",
         "Description", "LineNumber", "EntityType", "EntityId",
         "EntryDate", "CreatedAt", "TransactionCurrency"
       ) VALUES (
         $1, $2, $2, $3,
         'DEBIT', $4, $4, 0,
         $5, 2, 'SUPPLIER', $6,
         $7::date, NOW(), 'UGX'
       )`,
      [
        randomUUID(),
        txnId,
        bankLine.account_id,
        AMOUNT,
        `Restore bank for reversed ${PAYMENT_NUMBER}→${SCN_NUMBER} allocation`,
        payment.supplier_id,
        today,
      ],
    );

    await client.query('COMMIT');
    console.log('Posted', txnNumber);

    // Trial Balance reads gl_period_balances — raw inserts skip AccountingCore UPSERT
    console.log('Rebuilding gl_period_balances…');
    await client.query('BEGIN');
    await client.query("SET LOCAL timezone = 'UTC'");
    const gpb = await client.query(
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
    await client.query('COMMIT');
    console.log('GPB rows upserted:', gpb.rowCount);

    const after = await pool.query(
      `SELECT COALESCE(SUM(le."CreditAmount"-le."DebitAmount"),0)::float8 AS gl
       FROM ledger_entries le
       JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
       JOIN accounts a ON a."Id"=le."AccountId"
       WHERE a."AccountCode"='2100' AND le."EntityId"::uuid=$1::uuid AND ${NET}`,
      [payment.supplier_id],
    );
    console.log('ACCULIFE GL 2100 after:', fmt(after.rows[0].gl));
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
} catch (e) {
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
