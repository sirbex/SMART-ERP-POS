#!/usr/bin/env node
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.HENBER_DATABASE_URL || process.env.DATABASE_URL,
});
const NET = `
  lt."Status" = 'POSTED' AND lt."IsReversed" = FALSE
  AND lt."Id" NOT IN (
    SELECT "ReversedByTransactionId" FROM ledger_transactions
    WHERE "ReversedByTransactionId" IS NOT NULL
  )`;

const kam = await pool.query(
  `SELECT "Id", "CompanyName", "OutstandingBalance" FROM suppliers WHERE "CompanyName" ILIKE '%KAMCARE%' LIMIT 1`,
);
const s = kam.rows[0];
console.log('Supplier:', s);

const gl = await pool.query(
  `
  SELECT COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0) AS gl
  FROM ledger_entries le
  JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
  JOIN accounts a ON a."Id" = le."AccountId"
  WHERE a."AccountCode" = '2100'
    AND UPPER(le."EntityType") = 'SUPPLIER'
    AND le."EntityId" = $1::text
    AND lt."ReferenceType" NOT IN ('EXPENSE', 'EXPENSE_PAYMENT')
    AND ${NET}`,
  [s.Id],
);

const oiPosted = await pool.query(
  `
  SELECT COALESCE(SUM(
    CASE WHEN document_type = 'SUPPLIER_CREDIT_NOTE'
      THEN -COALESCE("OutstandingBalance", 0)
      ELSE COALESCE("OutstandingBalance", 0) END
  ), 0) AS inv
  FROM supplier_invoices
  WHERE "SupplierId" = $1
    AND deleted_at IS NULL
    AND UPPER("Status") NOT IN ('PAID', 'CANCELLED', 'DELETED', 'DRAFT')
    AND COALESCE(is_posted_to_gl, FALSE) = TRUE`,
  [s.Id],
);

const oiAll = await pool.query(
  `
  SELECT "SupplierInvoiceNumber", document_type, "Status", "TotalAmount",
    "OutstandingBalance", is_posted_to_gl
  FROM supplier_invoices
  WHERE "SupplierId" = $1 AND deleted_at IS NULL
  ORDER BY "SupplierInvoiceNumber"`,
  [s.Id],
);

const txns = await pool.query(
  `
  SELECT lt."TransactionNumber", lt."ReferenceType", lt."ReferenceId",
    SUM(le."CreditAmount") AS cr, SUM(le."DebitAmount") AS dr,
    SUM(le."CreditAmount" - le."DebitAmount") AS net
  FROM ledger_entries le
  JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
  JOIN accounts a ON a."Id" = le."AccountId"
  WHERE a."AccountCode" = '2100'
    AND le."EntityId" = $1::text
    AND ${NET}
  GROUP BY lt."Id", lt."TransactionNumber", lt."ReferenceType", lt."ReferenceId"
  ORDER BY lt."TransactionNumber"`,
  [s.Id],
);

const glN = Number(gl.rows[0].gl);
const oiN = Number(oiPosted.rows[0].inv);
console.log('\nGL net-active:', glN);
console.log('Open-item (posted):', oiN);
console.log('Integrity drift:', glN - oiN);
console.log('\nInvoices:', oiAll.rows);
console.log('\n2100 txns:', txns.rows);

await pool.end();
