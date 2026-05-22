#!/usr/bin/env node
/**
 * Verify posted customer credit notes have matching GL journals (account 1200 credit).
 *
 * Usage:
 *   node scripts/proof-credit-note-gl.mjs
 *   node scripts/proof-credit-note-gl.mjs --invoice INV-2026-0001
 */
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system',
});

const invoiceArg =
  process.argv.find((a) => a.startsWith('--invoice='))?.split('=')[1]
  ?? (process.argv.includes('--invoice') ? process.argv[process.argv.indexOf('--invoice') + 1] : null);

const client = await pool.connect();
try {
  const params = [];
  let filter = '';
  if (invoiceArg) {
    params.push(invoiceArg);
    filter = `AND ref.invoice_number = $${params.length}`;
  }

  const missing = await client.query(
    `SELECT cn.invoice_number AS cn_number, ref.invoice_number AS inv_number, cn.total_amount
     FROM invoices cn
     JOIN invoices ref ON ref.id = cn.reference_invoice_id
     WHERE cn.document_type = 'CREDIT_NOTE'
       AND cn.status = 'POSTED'
       ${filter}
       AND NOT EXISTS (
         SELECT 1 FROM ledger_transactions lt
         WHERE lt."ReferenceType" = 'CREDIT_NOTE'
           AND lt."ReferenceId" = cn.id
           AND lt."IsReversed" = false
       )
     ORDER BY cn.issue_date DESC
     LIMIT 20`,
    params,
  );

  const sample = await client.query(
    `SELECT cn.invoice_number, ref.invoice_number AS parent_inv,
            lt."TransactionNumber", lt."Description",
            le."CreditAmount" AS ar_credit
     FROM invoices cn
     JOIN invoices ref ON ref.id = cn.reference_invoice_id
     JOIN ledger_transactions lt ON lt."ReferenceType" = 'CREDIT_NOTE' AND lt."ReferenceId" = cn.id
     JOIN ledger_entries le ON le."TransactionId" = lt."Id"
     JOIN accounts a ON a."Id" = le."AccountId" AND a."AccountCode" = '1200'
     WHERE cn.document_type = 'CREDIT_NOTE' AND cn.status = 'POSTED'
       ${filter}
     ORDER BY cn.issue_date DESC
     LIMIT 5`,
    params,
  );

  console.log('\n=== Credit note ↔ GL proof ===\n');
  if (missing.rows.length) {
    console.error(`FAIL  ${missing.rows.length} posted credit note(s) with NO GL journal:`);
    for (const r of missing.rows) {
      console.error(`      ${r.cn_number} → ${r.inv_number} (${r.total_amount})`);
    }
    process.exit(1);
  }
  console.log('PASS  All posted credit notes in scope have CREDIT_NOTE GL transactions');
  if (sample.rows.length) {
    console.log('\nSample GL lines (search General Ledger for parent invoice / sale):');
    for (const r of sample.rows) {
      console.log(`  ${r.cn_number} → ${r.parent_inv} | ${r.TransactionNumber} | AR credit ${r.ar_credit}`);
      console.log(`    ${(r.Description || '').slice(0, 120)}`);
    }
  }
  console.log('');
  process.exit(0);
} finally {
  client.release();
  await pool.end();
}
