#!/usr/bin/env node
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.HENBER_DATABASE_URL || process.env.DATABASE_URL,
});

const kam = await pool.query(
  `SELECT "Id" FROM suppliers WHERE "CompanyName" ILIKE '%KAMCARE%' LIMIT 1`,
);
const sid = kam.rows[0].Id;

const negOb = await pool.query(
  `
  SELECT "SupplierInvoiceNumber", document_type, "Status", "TotalAmount", "OutstandingBalance", is_posted_to_gl
  FROM supplier_invoices
  WHERE "SupplierId" = $1 AND deleted_at IS NULL
    AND COALESCE("OutstandingBalance", 0) < -0.01
  ORDER BY "OutstandingBalance"`,
  [sid],
);

const scnUnposted = await pool.query(
  `
  SELECT "SupplierInvoiceNumber", "Status", "TotalAmount", "OutstandingBalance", is_posted_to_gl
  FROM supplier_invoices
  WHERE "SupplierId" = $1 AND deleted_at IS NULL
    AND document_type = 'SUPPLIER_CREDIT_NOTE'
    AND COALESCE(is_posted_to_gl, FALSE) = FALSE
  ORDER BY 1`,
  [sid],
);

const scnGl = await pool.query(
  `
  SELECT si."SupplierInvoiceNumber", lt."TransactionNumber", lt."IsReversed",
    SUM(le."DebitAmount") dr, SUM(le."CreditAmount") cr
  FROM supplier_invoices si
  JOIN ledger_transactions lt ON lt."ReferenceId"::text = si."Id"::text
    AND lt."ReferenceType" = 'SUPPLIER_CREDIT_NOTE'
  JOIN ledger_entries le ON le."TransactionId" = lt."Id"
  JOIN accounts a ON a."Id" = le."AccountId" AND a."AccountCode" = '2100'
  WHERE si."SupplierId" = $1 AND si.deleted_at IS NULL
  GROUP BY si."SupplierInvoiceNumber", lt."TransactionNumber", lt."IsReversed"`,
  [sid],
);

const openSum = await pool.query(
  `
  SELECT COALESCE(SUM(
    CASE WHEN document_type = 'SUPPLIER_CREDIT_NOTE'
      THEN -COALESCE("OutstandingBalance", 0)
      ELSE COALESCE("OutstandingBalance", 0) END
  ), 0) AS simple_open
  FROM supplier_invoices
  WHERE "SupplierId" = $1 AND deleted_at IS NULL
    AND UPPER("Status") NOT IN ('PAID', 'CANCELLED', 'DELETED', 'DRAFT')
    AND COALESCE(is_posted_to_gl, FALSE) = TRUE`,
  [sid],
);

console.log('Negative OB invoices:', negOb.rows);
console.log('SCNs is_posted_to_gl=false:', scnUnposted.rows);
console.log('SCN GL legs:', scnGl.rows);
const openRows = await pool.query(
  `
  SELECT "SupplierInvoiceNumber", "Status", "OutstandingBalance", document_type
  FROM supplier_invoices
  WHERE "SupplierId" = $1 AND deleted_at IS NULL
    AND UPPER("Status") NOT IN ('PAID', 'CANCELLED', 'DELETED', 'DRAFT')
    AND COALESCE(is_posted_to_gl, FALSE) = TRUE
  ORDER BY 1`,
  [sid],
);
console.log('Open-item rows:', openRows.rows);
console.log('Open-item sum:', openRows.rows.reduce((a, x) => {
  const ob = Number(x.OutstandingBalance);
  return a + (x.document_type === 'SUPPLIER_CREDIT_NOTE' ? -ob : ob);
}, 0));

await pool.end();
