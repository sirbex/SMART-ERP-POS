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
  const gl = await pool.query(
    `SELECT a."AccountCode" AS acct,
            COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS net
     FROM ledger_entries le
     JOIN accounts a ON le."AccountId" = a."Id"
     JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
     WHERE a."AccountCode" IN ('2100', '2150')
       AND le."EntityId" = $1
       AND UPPER(le."EntityType") = 'SUPPLIER'
       AND lt."Status" = 'POSTED'
       AND lt."IsReversed" = FALSE
       AND lt."Id" NOT IN (
         SELECT "ReversedByTransactionId" FROM ledger_transactions
         WHERE "ReversedByTransactionId" IS NOT NULL
       )
     GROUP BY a."AccountCode"`,
    [id],
  );
  const ap2100 = Number(gl.rows.find((r) => r.acct === '2100')?.net ?? 0);
  const grir2150 = Number(gl.rows.find((r) => r.acct === '2150')?.net ?? 0);
  const glPosition = ap2100 + grir2150;

  console.table({
    cached_column: fmt(b.cached),
    wrong_performance_formula: fmt(b.raw_sum_no_scn),
    credit_notes_if_added_wrong: fmt(b.credit_notes_positive),
    open_item_invoices: fmt(b.open_item_invoices),
    unallocated_payments: fmt(b.unallocated),
    open_item_balance: fmt(openItem),
    gap_wrong_minus_correct: fmt(Number(b.raw_sum_no_scn) - openItem),
    gl_2100_entity: fmt(ap2100),
    gl_2150_grir_entity: fmt(grir2150),
    gl_supplier_position_2100_plus_2150: fmt(glPosition),
    gap_gl_position_minus_open_item: fmt(glPosition - openItem),
  });

  if (process.argv.includes('--repair') || process.argv.includes('--heal')) {
    const { repairSupplierInvoiceOutstandingFromLedger } = await import(
      '/app/dist/SamplePOS.Server/src/modules/supplier-payments/supplierPaymentRepository.js'
    );
    const { syncSupplierBalanceFromOpenItems } = await import(
      '/app/dist/SamplePOS.Server/src/modules/supplier-payments/apReconciliationEngine.js'
    );
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inv = await repairSupplierInvoiceOutstandingFromLedger(client, id);
      const r = await syncSupplierBalanceFromOpenItems(client, id, 'SALUD_HEAL');
      await client.query('COMMIT');
      console.log('Invoice repair:', inv);
      console.log('Supplier cache:', r);
    } finally {
      client.release();
    }

    const after = await pool.query(
      `SELECT a."AccountCode" AS acct,
              COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS net
       FROM ledger_entries le
       JOIN accounts a ON le."AccountId" = a."Id"
       JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
       WHERE a."AccountCode" IN ('2100', '2150')
         AND le."EntityId" = $1
         AND UPPER(le."EntityType") = 'SUPPLIER'
         AND lt."Status" = 'POSTED'
         AND lt."IsReversed" = FALSE
       GROUP BY a."AccountCode"`,
      [id],
    );
    const ap2100After = Number(after.rows.find((r) => r.acct === '2100')?.net ?? 0);
    const grirAfter = Number(after.rows.find((r) => r.acct === '2150')?.net ?? 0);
    const br2 = await pool.query(
      `SELECT COALESCE(SUM(
         CASE WHEN document_type = 'SUPPLIER_CREDIT_NOTE'
           THEN -COALESCE("OutstandingBalance", 0)
           ELSE COALESCE("OutstandingBalance", 0) END
       ), 0) AS open_item
       FROM supplier_invoices
       WHERE "SupplierId" = $1 AND deleted_at IS NULL
         AND UPPER("Status") NOT IN ('PAID','CANCELLED','DELETED','DRAFT')`,
      [id],
    );
    const openAfter = Number(br2.rows[0]?.open_item ?? 0);
    console.log('After heal:', {
      open_item: fmt(openAfter),
      gl_2100: fmt(ap2100After),
      grir_2150: fmt(grirAfter),
      gl_position: fmt(ap2100After + grirAfter),
      gap_gl_minus_open: fmt(ap2100After + grirAfter - openAfter),
    });
  }
} finally {
  await pool.end();
}
