#!/usr/bin/env node
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.HENBER_DATABASE_URL });
const NET = `lt."Status"='POSTED' AND lt."IsReversed"=FALSE AND lt."Id" NOT IN (SELECT "ReversedByTransactionId" FROM ledger_transactions WHERE "ReversedByTransactionId" IS NOT NULL)`;

for (const scn of ['SCN-2026-0007', 'SCN-2026-0008']) {
  const r = await pool.query(
    `
    SELECT lt."TransactionNumber", lt."IsReversed", lt."ReferenceType",
      SUM(le."DebitAmount") dr, SUM(le."CreditAmount") cr,
      lt."IdempotencyKey"
    FROM supplier_invoices si
    JOIN ledger_transactions lt ON (
      lt."ReferenceId"::text = si."Id"::text
      OR (si.return_grn_id IS NOT NULL AND lt."ReferenceId"::text = si.return_grn_id::text)
    )
    JOIN ledger_entries le ON le."TransactionId" = lt."Id"
    JOIN accounts a ON a."Id" = le."AccountId" AND a."AccountCode" = '2100'
    WHERE si."SupplierInvoiceNumber" = $1
    GROUP BY lt."Id", lt."TransactionNumber", lt."IsReversed", lt."ReferenceType", lt."IdempotencyKey"
    ORDER BY lt."TransactionNumber"`,
    [scn],
  );
  console.log('\n', scn, r.rows);
}

const sid = (await pool.query(`SELECT "Id" FROM suppliers WHERE "CompanyName" ILIKE '%KAMCARE%'`)).rows[0].Id;
const allScnNet = await pool.query(
  `
  SELECT COALESCE(SUM(le."CreditAmount"-le."DebitAmount"),0) net
  FROM ledger_entries le
  JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
  JOIN accounts a ON a."Id"=le."AccountId"
  JOIN supplier_invoices si ON lt."ReferenceId"::text = si."Id"::text
  WHERE a."AccountCode"='2100' AND si.document_type='SUPPLIER_CREDIT_NOTE'
    AND si."SupplierId"=$1 AND ${NET}`,
  [sid],
);
console.log('\nAll SCN net-active 2100:', allScnNet.rows[0].net);

await pool.end();
