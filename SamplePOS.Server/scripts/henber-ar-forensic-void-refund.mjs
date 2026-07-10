#!/usr/bin/env node
import pg from 'pg';
import { resolveVerificationEnvironment } from '../../scripts/lib/production-verification-guard.mjs';

const { henberDatabaseUrl } = resolveVerificationEnvironment({
  scriptName: 'void/refund trace',
  requireHenberDatabase: true,
});
const pool = new pg.Pool({ connectionString: henberDatabaseUrl });

try {
  const r = await pool.query(`
    SELECT s.id, s.sale_number, s.status, s.payment_method, s.total_amount,
           i.invoice_number, i.status AS inv_status, i.amount_due,
           sr.id AS refund_id, sr.refund_number, sr.total_amount AS refund_amt, sr.status AS refund_status
    FROM sales s
    LEFT JOIN invoices i ON i.sale_id = s.id
    LEFT JOIN sale_refunds sr ON sr.sale_id = s.id
    WHERE s.sale_number = 'SALE-2026-3251'
  `);
  console.log('=== SALE-2026-3251 (case hospital void) ===');
  console.log(r.rows);

  const gl = await pool.query(`
    SELECT lt."TransactionNumber", lt."ReferenceType", lt."Status", lt."IsReversed",
           SUM(CASE WHEN a."AccountCode" = '1200' THEN le."DebitAmount" - le."CreditAmount" ELSE 0 END)::numeric AS net_1200
    FROM ledger_transactions lt
    JOIN ledger_entries le ON le."TransactionId" = lt."Id"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE lt."ReferenceId"::text IN (
      SELECT id::text FROM sales WHERE sale_number = 'SALE-2026-3251'
      UNION
      SELECT id::text FROM sale_refunds WHERE sale_id IN (SELECT id FROM sales WHERE sale_number = 'SALE-2026-3251')
    )
    GROUP BY lt."Id", lt."TransactionNumber", lt."ReferenceType", lt."Status", lt."IsReversed"
    ORDER BY lt."TransactionNumber"
  `);
  console.log('GL transactions:', gl.rows);

  const refunds = await pool.query(`
    SELECT lt."TransactionNumber", lt."ReferenceType", lt."ReferenceId",
           sr.refund_number, s.sale_number, c.name, i.invoice_number, i.amount_due,
           SUM(CASE WHEN a."AccountCode" = '1200' THEN le."DebitAmount" - le."CreditAmount" ELSE 0 END)::numeric AS net_1200
    FROM ledger_transactions lt
    JOIN ledger_entries le ON le."TransactionId" = lt."Id"
    JOIN accounts a ON a."Id" = le."AccountId"
    LEFT JOIN sale_refunds sr ON sr.id::text = lt."ReferenceId"::text
    LEFT JOIN sales s ON s.id = sr.sale_id
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN invoices i ON i.sale_id = s.id
    WHERE lt."TransactionNumber" IN ('TXN-015298', 'TXN-016012')
    GROUP BY lt."TransactionNumber", lt."ReferenceType", lt."ReferenceId",
             sr.refund_number, s.sale_number, c.name, i.invoice_number, i.amount_due
  `);
  console.log('\n=== SALE_REFUND txns (−52,800 smoking gun) ===');
  console.log(refunds.rows);

  const bou = await pool.query(`SELECT id FROM customers WHERE name ILIKE '%BOU%' LIMIT 1`);
  const bouId = bou.rows[0]?.id;
  if (bouId) {
    const pays = await pool.query(
      `SELECT payment_number, total_amount, allocated_amount, unallocated_amount, status, payment_date::date
       FROM ar_customer_payments WHERE customer_id = $1 ORDER BY payment_date DESC LIMIT 5`,
      [bouId],
    );
    console.log('\n=== BOU recent payments ===');
    console.table(pays.rows);
  }
} finally {
  await pool.end();
}
