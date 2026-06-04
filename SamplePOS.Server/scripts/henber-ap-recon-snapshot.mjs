#!/usr/bin/env node
import pg from 'pg';

function dbUrl() {
  if (process.env.HENBER_DATABASE_URL) return process.env.HENBER_DATABASE_URL;
  return process.env.DATABASE_URL?.replace(/\/([^/?]+)(\?.*)?$/, '/pos_tenant_henber_pharmacy$2');
}

const pool = new pg.Pool({ connectionString: dbUrl() });
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

try {
  const r = await pool.query(`
    WITH gl_supplier AS (
      SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS balance
      FROM ledger_entries le
      JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '2100'
        AND UPPER(le."EntityType") = 'SUPPLIER'
        AND lt."Status" = 'POSTED'
    ),
    gl_total AS (
      SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS balance
      FROM ledger_entries le
      JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '2100' AND lt."Status" = 'POSTED'
    ),
    supplier_table AS (
      SELECT COALESCE(SUM("OutstandingBalance"), 0) AS balance FROM suppliers
    ),
    open_item AS (
      SELECT COALESCE(SUM(
        CASE WHEN document_type = 'SUPPLIER_CREDIT_NOTE'
          THEN -COALESCE("OutstandingBalance", 0)
          ELSE COALESCE("OutstandingBalance", 0) END
      ), 0) AS v
      FROM supplier_invoices
      WHERE deleted_at IS NULL
        AND UPPER("Status") NOT IN ('PAID','CANCELLED','DELETED','DRAFT')
    )
    SELECT gl_supplier.balance::numeric AS gl_entity_supplier,
           gl_total.balance::numeric AS gl_total_2100,
           supplier_table.balance::numeric AS suppliers_cache,
           open_item.v::numeric AS open_item_invoices
    FROM gl_supplier, gl_total, supplier_table, open_item
  `);
  const s = r.rows[0];
  console.log('Reconciliation page formula (EntityType=SUPPLIER):');
  console.table({
    gl_balance: fmt(s.gl_entity_supplier),
    subledger_suppliers_cache: fmt(s.suppliers_cache),
    difference_gl_minus_sub: fmt(Number(s.gl_entity_supplier) - Number(s.suppliers_cache)),
    open_item_invoices: fmt(s.open_item_invoices),
    gl_total_2100: fmt(s.gl_total_2100),
  });

  const top = await pool.query(`
    SELECT s."CompanyName" AS supplier,
           COALESCE(gl.net, 0)::numeric AS gl_entity,
           COALESCE(s."OutstandingBalance", 0)::numeric AS cache,
           COALESCE(oi.open_item, 0)::numeric AS open_item,
           (COALESCE(gl.net, 0) - COALESCE(s."OutstandingBalance", 0))::numeric AS gl_minus_cache,
           (COALESCE(s."OutstandingBalance", 0) - COALESCE(oi.open_item, 0))::numeric AS cache_minus_openitem
    FROM suppliers s
    LEFT JOIN LATERAL (
      SELECT SUM(le."CreditAmount") - SUM(le."DebitAmount") AS net
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '2100'
        AND le."EntityId"::text = s."Id"::text
        AND UPPER(le."EntityType") = 'SUPPLIER'
        AND lt."Status" = 'POSTED'
    ) gl ON TRUE
    LEFT JOIN LATERAL (
      SELECT GREATEST(
        COALESCE(SUM(
          CASE WHEN si.document_type = 'SUPPLIER_CREDIT_NOTE'
            THEN -COALESCE(si."OutstandingBalance", 0)
            ELSE COALESCE(si."OutstandingBalance", 0) END
        ), 0)
        - COALESCE((
          SELECT SUM(COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0)))
          FROM supplier_payments sp
          WHERE sp."SupplierId" = s."Id" AND sp.deleted_at IS NULL
            AND sp."Status" = 'COMPLETED'
            AND COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0)) > 0.009
        ), 0),
        0
      ) AS open_item
      FROM supplier_invoices si
      WHERE si."SupplierId" = s."Id" AND si.deleted_at IS NULL
        AND UPPER(si."Status") NOT IN ('PAID','CANCELLED','DELETED','DRAFT')
    ) oi ON TRUE
    WHERE ABS(COALESCE(gl.net, 0) - COALESCE(s."OutstandingBalance", 0)) > 50000
       OR ABS(COALESCE(s."OutstandingBalance", 0) - COALESCE(oi.open_item, 0)) > 50000
    ORDER BY ABS(COALESCE(gl.net, 0) - COALESCE(s."OutstandingBalance", 0)) DESC
    LIMIT 20
  `);
  console.log('\nPer-supplier GL entity vs cache (|drift| > 100k):');
  console.table(
    top.rows.map((x) => ({
      supplier: x.supplier,
      gl_entity: fmt(x.gl_entity),
      cache: fmt(x.cache),
      open_item: fmt(x.open_item),
      gl_minus_cache: fmt(x.gl_minus_cache),
      cache_minus_oi: fmt(x.cache_minus_openitem),
    })),
  );
} finally {
  await pool.end();
}
