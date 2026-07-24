/**
 * Heal Henber Undeposited Funds recon drift after AR reverse/correct:
 * 1) Close receipt_settlements residual for REVERSED AR payments never deposited
 * 2) Report GL 1015 vs unsettled before/after
 * 3) List recent CUSTOMER_PAYMENT reverses that over-cleared 1015 (already deposited)
 *
 * DRY_RUN=1 (default) | DRY_RUN=0 to apply
 */
import pg from 'pg';

const DRY_RUN = process.env.DRY_RUN !== '0';

const pool = new pg.Pool({
  connectionString:
    'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@209.38.203.138:5432/pos_tenant_henber_pharmacy',
  statement_timeout: 120_000,
});

async function recon() {
  const gl = await pool.query(
    `SELECT COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0)::float8 AS bal
     FROM ledger_entries le
     JOIN accounts a ON a."Id" = le."AccountId"
     WHERE a."AccountCode" = '1015'`,
  );
  const unsettled = await pool.query(
    `SELECT COALESCE(SUM(rs.residual_amount), 0)::float8 AS total
     FROM receipt_settlements rs
     LEFT JOIN ar_customer_payments p
       ON rs.source_type = 'AR_CUSTOMER_PAYMENT' AND p.id = rs.source_id
     WHERE rs.clearing_account_code = '1015'
       AND rs.residual_amount > 0.009
       AND (rs.source_type <> 'AR_CUSTOMER_PAYMENT' OR p.status IS DISTINCT FROM 'REVERSED')`,
  );
  const stale = await pool.query(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(rs.residual_amount),0)::float8 AS amt
     FROM receipt_settlements rs
     JOIN ar_customer_payments p ON p.id = rs.source_id
     WHERE rs.source_type = 'AR_CUSTOMER_PAYMENT'
       AND p.status = 'REVERSED'
       AND rs.residual_amount > 0.009
       AND COALESCE(rs.settled_amount, 0) <= 0.009`,
  );
  return {
    gl: gl.rows[0].bal,
    unsettled: unsettled.rows[0].total,
    difference: Number((gl.rows[0].bal - unsettled.rows[0].total).toFixed(2)),
    staleReversedOpen: stale.rows[0],
  };
}

async function main() {
  console.log('DRY_RUN=', DRY_RUN);
  console.log('\n=== BEFORE ===');
  console.log(await recon());

  const staleRows = await pool.query(
    `SELECT rs.source_number, rs.residual_amount::float8 AS residual, p.payment_number, p.status
     FROM receipt_settlements rs
     JOIN ar_customer_payments p ON p.id = rs.source_id
     WHERE rs.source_type = 'AR_CUSTOMER_PAYMENT'
       AND p.status = 'REVERSED'
       AND rs.residual_amount > 0.009
       AND COALESCE(rs.settled_amount, 0) <= 0.009
     ORDER BY rs.payment_date`,
  );
  console.log('\nStale REVERSED settlements still unsettled:');
  console.table(staleRows.rows);

  // Receipts reversed after deposit → GL 1015 over-cleared (net credit on that payment's postings)
  const overclear = await pool.query(
    `WITH pay AS (
       SELECT p.id, p.payment_number, p.status,
              COALESCE(rs.settled_amount, 0)::float8 AS settled
       FROM ar_customer_payments p
       LEFT JOIN receipt_settlements rs
         ON rs.source_type = 'AR_CUSTOMER_PAYMENT' AND rs.source_id = p.id
       WHERE p.status = 'REVERSED'
     ),
     gl AS (
       SELECT lt."ReferenceId"::uuid AS payment_id,
              SUM(le."DebitAmount" - le."CreditAmount")::float8 AS net_1015
       FROM ledger_transactions lt
       JOIN ledger_entries le ON le."TransactionId" = lt."Id"
       JOIN accounts a ON a."Id" = le."AccountId"
       WHERE lt."ReferenceType" = 'CUSTOMER_PAYMENT'
         AND a."AccountCode" = '1015'
       GROUP BY lt."ReferenceId"
     )
     SELECT pay.payment_number, pay.settled, gl.net_1015
     FROM pay
     JOIN gl ON gl.payment_id = pay.id
     WHERE ABS(gl.net_1015) > 0.009
     ORDER BY ABS(gl.net_1015) DESC
     LIMIT 20`,
  );
  console.log('\nREVERSED payments with non-zero net 1015 (investigate over-clear):');
  console.table(overclear.rows);

  if (DRY_RUN) {
    console.log('\nDry run only. Set DRY_RUN=0 to close stale REVERSED residuals + backfill INVOICE_PAYMENT settlements.');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE receipt_settlements rs
       SET residual_amount = 0,
           settlement_status = 'SETTLED',
           updated_at = NOW()
       FROM ar_customer_payments p
       WHERE rs.source_type = 'AR_CUSTOMER_PAYMENT'
         AND rs.source_id = p.id
         AND p.status = 'REVERSED'
         AND rs.residual_amount > 0.009
         AND COALESCE(rs.settled_amount, 0) <= 0.009
       RETURNING rs.source_number, rs.id`,
    );
    console.log(`\nClosed ${upd.rowCount} stale settlement row(s)`);
    if (upd.rows.length) console.table(upd.rows);

    const inv = await client.query(
      `INSERT INTO receipt_settlements (
         source_type, source_id, source_number, originating_amount, settled_amount, residual_amount,
         clearing_account_code, settlement_status, customer_id, payment_date, payment_method, ledger_transaction_id
       )
       SELECT
         'INVOICE_PAYMENT', ip.id, COALESCE(ip.receipt_number, ip.id::text),
         ROUND(le_cash.cash_debit::numeric, 2), 0, ROUND(le_cash.cash_debit::numeric, 2),
         '1015', 'UNSETTLED', i.customer_id, ip.payment_date::date, ip.payment_method, le_cash.txn_id
       FROM invoice_payments ip
       JOIN invoices i ON i.id = ip.invoice_id
       JOIN LATERAL (
         SELECT lt."Id" AS txn_id, SUM(le."DebitAmount") AS cash_debit
         FROM ledger_transactions lt
         JOIN ledger_entries le ON le."TransactionId" = lt."Id"
         JOIN accounts a ON a."Id" = le."AccountId"
         WHERE lt."ReferenceType" = 'INVOICE_PAYMENT'
           AND lt."ReferenceId" = ip.id
           AND a."AccountCode" = '1015'
           AND le."DebitAmount" > 0
         GROUP BY lt."Id"
       ) le_cash ON TRUE
       WHERE le_cash.cash_debit > 0.009
         AND NOT EXISTS (
           SELECT 1 FROM receipt_settlements rs
           WHERE rs.source_type = 'INVOICE_PAYMENT' AND rs.source_id = ip.id
         )
       ON CONFLICT (source_type, source_id) DO NOTHING
       RETURNING source_number, originating_amount`,
    );
    console.log(`Backfilled ${inv.rowCount} legacy INVOICE_PAYMENT settlement(s)`);
    if (inv.rows.length) console.table(inv.rows);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  console.log('\n=== AFTER ===');
  console.log(await recon());
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
