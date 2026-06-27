#!/usr/bin/env node
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.HENBER_DATABASE_URL });

const scns = await pool.query(`
  SELECT si."SupplierInvoiceNumber", si."Id", si.reference_invoice_id,
    si."TotalAmount", si."Status", si.is_posted_to_gl,
    ref."SupplierInvoiceNumber" AS ref_bill
  FROM supplier_invoices si
  LEFT JOIN supplier_invoices ref ON ref."Id" = si.reference_invoice_id
  WHERE si."SupplierInvoiceNumber" IN ('SCN-2026-0007','SCN-2026-0008')
`);

console.log('SCNs:', scns.rows);

const txn = await pool.query(`
  SELECT lt."TransactionNumber", lt."ReferenceType", lt."ReferenceId",
    lt."IdempotencyKey", le."DebitAmount", le."CreditAmount", a."AccountCode"
  FROM ledger_transactions lt
  JOIN ledger_entries le ON le."TransactionId"=lt."Id"
  JOIN accounts a ON a."Id"=le."AccountId"
  WHERE lt."TransactionNumber" IN ('TXN-011801','TXN-013737','TXN-010561')
  ORDER BY lt."TransactionNumber", a."AccountCode"
`);
console.log('Txns:', txn.rows);

await pool.end();
