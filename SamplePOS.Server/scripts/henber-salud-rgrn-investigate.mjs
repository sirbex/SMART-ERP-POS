#!/usr/bin/env node
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.HENBER_DATABASE_URL });
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

try {
  const salud = await pool.query(
    `SELECT "Id", "CompanyName" FROM suppliers WHERE "CompanyName" ILIKE '%SALUD%' LIMIT 1`,
  );
  const sid = salud.rows[0].Id;
  console.log(`Supplier: ${salud.rows[0].CompanyName} (${sid})\n`);

  console.log('=== SALUD RETURN_GRN GL on 2100 ===');
  const grn = await pool.query(
    `
    SELECT lt."TransactionNumber", lt."ReferenceId", lt."Description",
      (SUM(le."DebitAmount")-SUM(le."CreditAmount"))::numeric AS ap_debit,
      lt."TransactionDate"::date AS txn_date,
      lt."IsReversed"
    FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
    JOIN accounts a ON a."Id"=le."AccountId"
    WHERE a."AccountCode"='2100' AND lt."ReferenceType"='RETURN_GRN'
      AND le."EntityId"::text=$1
    GROUP BY lt."Id", lt."TransactionNumber", lt."ReferenceId", lt."Description",
      lt."TransactionDate", lt."IsReversed"
    ORDER BY lt."TransactionDate"
    `,
    [sid],
  );
  console.table(grn.rows.map((r) => ({
    txn: r.TransactionNumber,
    date: r.txn_date,
    ap_debit: fmt(r.ap_debit),
    reversed: r.IsReversed,
    ref: String(r.ReferenceId).slice(0, 8),
    desc: (r.Description || '').slice(0, 60),
  })));
  const grnSum = grn.rows
    .filter((r) => !r.IsReversed)
    .reduce((a, r) => a + Number(r.ap_debit), 0);
  console.log(`Net active RETURN_GRN AP debit: ${fmt(grnSum)}\n`);

  console.log('=== Return GRN documents (return_grn table) ===');
  const docs = await pool.query(
    `
    SELECT r.id, r.return_grn_number, r.status, r.return_date::date,
      COALESCE(SUM(rl.line_total),0)::numeric AS line_total,
      r.grn_id,
      gr.receipt_number AS source_grn
    FROM return_grn r
    LEFT JOIN return_grn_lines rl ON rl.rgrn_id = r.id
    LEFT JOIN goods_receipts gr ON gr.id = r.grn_id
    WHERE r.supplier_id=$1
    GROUP BY r.id, r.return_grn_number, r.status, r.return_date, r.grn_id, gr.receipt_number
    ORDER BY r.return_date
    `,
    [sid],
  );
  console.table(docs.rows);

  console.log('=== SCNs with return_grn_id for SALUD ===');
  const scnRgrn = await pool.query(
    `
    SELECT si."SupplierInvoiceNumber", si."Status", si."TotalAmount"::numeric,
      si."OutstandingBalance"::numeric, si.return_grn_id,
      r.return_grn_number
    FROM supplier_invoices si
    LEFT JOIN return_grn r ON r.id = si.return_grn_id
    WHERE si."SupplierId"=$1 AND si.return_grn_id IS NOT NULL AND si.deleted_at IS NULL
  `,
    [sid],
  );
  console.table(scnRgrn.rows);

  console.log('=== SCNs linked to SALUD invoices (return_grn_id) ===');
  const scn = await pool.query(
    `
    SELECT si."SupplierInvoiceNumber", si."Status", si.document_type,
      si."TotalAmount"::numeric, si."OutstandingBalance"::numeric,
      si.return_grn_id IS NOT NULL AS has_return_grn,
      si.reference_invoice_id IS NOT NULL AS has_ref_inv
    FROM supplier_invoices si
    WHERE si."SupplierId"=$1 AND si.deleted_at IS NULL
      AND (si.return_grn_id IS NOT NULL OR si.document_type='SUPPLIER_CREDIT_NOTE')
    ORDER BY si."SupplierInvoiceNumber"
    `,
    [sid],
  );
  console.table(scn.rows);

  console.log('=== Untagged CORRECTION on 2100 (full JE lines) ===');
  const corr = await pool.query(
    `
    SELECT lt."Id" AS txn_id, lt."TransactionNumber", lt."Description",
      lt."TransactionDate"::date, lt."ReferenceType", lt."ReferenceId",
      lt."IsReversed", lt."Status",
      a."AccountCode", le."DebitAmount"::numeric, le."CreditAmount"::numeric,
      le."EntityType", le."EntityId"
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
    JOIN accounts a ON a."Id"=le."AccountId"
    WHERE lt."ReferenceType"='CORRECTION' AND lt."Status"='POSTED'
      AND lt."TransactionNumber" IN ('TXN-013389')
       OR (lt."ReferenceType"='CORRECTION' AND a."AccountCode"='2100'
           AND (le."EntityId" IS NULL OR UPPER(COALESCE(le."EntityType",''))!='SUPPLIER')
           AND lt."Status"='POSTED' AND lt."IsReversed"=FALSE)
    ORDER BY lt."TransactionNumber", a."AccountCode"
    `,
  );
  console.table(corr.rows);

  console.log('=== All CORRECTION txns on 2100 without supplier entity ===');
  const allCorr = await pool.query(
    `
    SELECT lt."Id", lt."TransactionNumber", lt."Description",
      (SUM(CASE WHEN a."AccountCode"='2100' THEN le."CreditAmount"-le."DebitAmount" ELSE 0 END))::numeric AS net_2100,
      lt."IsReversed"
    FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
    JOIN accounts a ON a."Id"=le."AccountId"
    WHERE lt."ReferenceType"='CORRECTION' AND lt."Status"='POSTED'
      AND lt."Id" IN (
        SELECT DISTINCT le2."TransactionId" FROM ledger_entries le2
        JOIN accounts a2 ON a2."Id"=le2."AccountId"
        WHERE a2."AccountCode"='2100'
          AND (le2."EntityId" IS NULL OR UPPER(COALESCE(le2."EntityType",''))!='SUPPLIER')
      )
    GROUP BY lt."Id", lt."TransactionNumber", lt."Description", lt."IsReversed"
    `,
  );
  console.table(allCorr.rows);

  console.log('=== Full JE lines for key transactions ===');
  const lines = await pool.query(
    `
    SELECT lt."TransactionNumber", a."AccountCode", a."AccountName",
      le."DebitAmount"::numeric, le."CreditAmount"::numeric,
      le."EntityType", le."EntityId"
    FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
    JOIN accounts a ON a."Id"=le."AccountId"
    WHERE lt."TransactionNumber" IN ('TXN-002840','TXN-003104','TXN-013389','TXN-011802')
    ORDER BY lt."TransactionNumber", a."AccountCode"
    `,
  );
  console.table(lines.rows);

  console.log('=== SALUD RGRNs with 2100 debit but NO SCN ===');
  const orphanRgrn = await pool.query(
    `
    WITH rgrn_2100 AS (
      SELECT DISTINCT lt."ReferenceId"::uuid AS rgrn_id,
        (SUM(le."DebitAmount")-SUM(le."CreditAmount"))::numeric AS ap_debit
      FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
      JOIN accounts a ON a."Id"=le."AccountId"
      WHERE a."AccountCode"='2100' AND lt."ReferenceType"='RETURN_GRN'
        AND le."EntityId"::text=$1 AND lt."IsReversed"=FALSE
      GROUP BY lt."ReferenceId"
    )
    SELECT r.return_grn_number, r.status, r.return_date::date, r.grn_id,
      g.ap_debit,
      EXISTS(SELECT 1 FROM supplier_invoices si WHERE si.return_grn_id=r.id AND si.deleted_at IS NULL) AS has_scn
    FROM return_grn r JOIN rgrn_2100 g ON g.rgrn_id=r.id
    ORDER BY r.return_date
    `,
    [sid],
  );
  console.table(orphanRgrn.rows);
} finally {
  await pool.end();
}
