#!/usr/bin/env node
/** Henber — SALUD PHARMACY AP balance breakdown + cache repair */
import pg from 'pg';

function henberDatabaseUrl() {
  if (process.env.HENBER_DATABASE_URL) return process.env.HENBER_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (base) return base.replace(/\/([^/?]+)(\?.*)?$/, '/pos_tenant_henber_pharmacy$2');
  return 'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@postgres:5432/pos_tenant_henber_pharmacy';
}

const pool = new pg.Pool({ connectionString: henberDatabaseUrl() });
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

try {
  const sup = await pool.query(
    `SELECT "Id", "CompanyName", COALESCE("OutstandingBalance", 0) AS cached
     FROM suppliers WHERE "CompanyName" ILIKE '%SALUD%' LIMIT 1`,
  );
  const row = sup.rows[0];
  if (!row) throw new Error('SALUD supplier not found');
  const id = row.Id;
  console.log('Supplier:', row.CompanyName, id);

  const br = await pool.query(
    `SELECT
      (SELECT COALESCE(SUM("OutstandingBalance"), 0)
       FROM supplier_invoices
       WHERE "SupplierId" = $1 AND deleted_at IS NULL
         AND "Status" NOT IN ('Paid','PAID','Cancelled','CANCELLED')) AS raw_sum_no_scn,
      (SELECT COALESCE(SUM(
         CASE WHEN document_type = 'SUPPLIER_CREDIT_NOTE'
           THEN -COALESCE("OutstandingBalance", 0)
           ELSE COALESCE("OutstandingBalance", 0) END
       ), 0)
       FROM supplier_invoices
       WHERE "SupplierId" = $1 AND deleted_at IS NULL
         AND UPPER("Status") NOT IN ('PAID','CANCELLED','DELETED','DRAFT')) AS open_item_invoices,
      (SELECT COALESCE(SUM(COALESCE("OutstandingBalance", 0)), 0)
       FROM supplier_invoices
       WHERE "SupplierId" = $1 AND deleted_at IS NULL
         AND document_type = 'SUPPLIER_CREDIT_NOTE'
         AND UPPER("Status") NOT IN ('PAID','CANCELLED','DELETED','DRAFT')) AS credit_notes_positive,
      (SELECT COALESCE(SUM(
         COALESCE("UnallocatedAmount", "Amount" - COALESCE("AllocatedAmount", 0))
       ), 0)
       FROM supplier_payments
       WHERE "SupplierId" = $1 AND deleted_at IS NULL AND "Status" = 'COMPLETED'
         AND COALESCE("UnallocatedAmount", "Amount" - COALESCE("AllocatedAmount", 0)) > 0.009) AS unallocated,
      $2::numeric AS cached`,
    [id, row.cached],
  );
  const b = br.rows[0];
  const openItem = Math.max(0, Number(b.open_item_invoices) - Number(b.unallocated));
  console.table({
    cached_column: fmt(b.cached),
    wrong_performance_formula: fmt(b.raw_sum_no_scn),
    credit_notes_if_added_wrong: fmt(b.credit_notes_positive),
    open_item_invoices: fmt(b.open_item_invoices),
    unallocated_payments: fmt(b.unallocated),
    open_item_balance: fmt(openItem),
    gap_wrong_minus_correct: fmt(Number(b.raw_sum_no_scn) - openItem),
  });

  if (process.argv.includes('--repair')) {
    const { syncSupplierBalanceFromOpenItems } = await import(
      '/app/dist/SamplePOS.Server/src/modules/supplier-payments/apReconciliationEngine.js'
    );
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await syncSupplierBalanceFromOpenItems(client, id, 'SALUD_INVESTIGATE_REPAIR');
      await client.query('COMMIT');
      console.log('Cache repaired:', r);
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
