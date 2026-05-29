#!/usr/bin/env node
/**
 * Fix orphan supplier payments: header says allocated but no allocation rows exist.
 * Resets header then auto-allocates FIFO to open invoices.
 */
import pg from 'pg';
import { recalcAllSupplierBalances } from '/app/dist/SamplePOS.Server/src/modules/system/glRepairService.js';
import { autoAllocatePayment } from '/app/dist/SamplePOS.Server/src/modules/supplier-payments/supplierPaymentService.js';

function henberDatabaseUrl() {
  if (process.env.HENBER_DATABASE_URL) return process.env.HENBER_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (base) {
    return base.replace(/\/([^/?]+)(\?.*)?$/, '/pos_tenant_henber_pharmacy$2');
  }
  return 'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@postgres:5432/pos_tenant_henber_pharmacy';
}

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const pool = new pg.Pool({ connectionString: henberDatabaseUrl() });

async function totals() {
  const res = await pool.query(`
    WITH gl_supplier AS (
      SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS balance
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '2100'
        AND UPPER(le."EntityType") = 'SUPPLIER'
        AND lt."Status" = 'POSTED'
    ),
    supplier_table AS (
      SELECT COALESCE(SUM("OutstandingBalance"), 0) AS balance FROM suppliers
    ),
    invoice_sum AS (
      SELECT COALESCE(SUM(
        CASE WHEN document_type = 'SUPPLIER_CREDIT_NOTE'
          THEN -COALESCE("OutstandingBalance", 0)
          ELSE COALESCE("OutstandingBalance", 0)
        END
      ), 0) AS balance
      FROM supplier_invoices
      WHERE deleted_at IS NULL
        AND UPPER("Status") NOT IN ('PAID', 'CANCELLED', 'DELETED')
    )
    SELECT gs.balance AS supplier_gl, st.balance AS suppliers_sum, inv.balance AS invoice_sum,
           gs.balance - st.balance AS gap_suppliers,
           gs.balance - inv.balance AS gap_invoices
    FROM gl_supplier gs, supplier_table st, invoice_sum inv
  `);
  return res.rows[0];
}

try {
  console.log('Henber AP orphan payment fix | DRY_RUN=', DRY_RUN);
  console.log('Before:', await totals());

  const orphans = await pool.query(`
    SELECT sp."Id", sp."PaymentNumber", s."CompanyName" AS supplier,
           sp."Amount"::numeric AS amount,
           COALESCE(sp."AllocatedAmount", 0)::numeric AS header_allocated,
           COALESCE((
             SELECT SUM(spa."AmountAllocated")
             FROM supplier_payment_allocations spa
             WHERE spa."PaymentId" = sp."Id" AND spa.deleted_at IS NULL
           ), 0)::numeric AS rows_allocated
    FROM supplier_payments sp
    JOIN suppliers s ON s."Id" = sp."SupplierId"
    WHERE UPPER(sp."Status") NOT IN ('CANCELLED', 'VOID', 'DELETED')
      AND COALESCE(sp."AllocatedAmount", 0) > 0.01
      AND COALESCE((
        SELECT SUM(spa."AmountAllocated")
        FROM supplier_payment_allocations spa
        WHERE spa."PaymentId" = sp."Id" AND spa.deleted_at IS NULL
      ), 0) < 0.01
    ORDER BY sp."Amount" DESC
  `);

  console.log(`\nOrphan allocated headers (no allocation rows): ${orphans.rows.length}`);
  console.table(orphans.rows);

  if (DRY_RUN) {
    console.log('\nDRY_RUN — no changes.');
    process.exit(0);
  }

  for (const p of orphans.rows) {
    await pool.query(
      `UPDATE supplier_payments
       SET "AllocatedAmount" = 0,
           "UnallocatedAmount" = "Amount",
           "UpdatedAt" = NOW()
       WHERE "Id" = $1`,
      [p.Id],
    );
    console.log(`→ Reset header ${p.PaymentNumber}`);
    try {
      await autoAllocatePayment(pool, p.Id);
      console.log(`→ Auto-allocated ${p.PaymentNumber}`);
    } catch (e) {
      console.log(`→ Skip allocate ${p.PaymentNumber}: ${e?.message || e}`);
    }
  }

  console.log('\n→ recalcAllSupplierBalances:', await recalcAllSupplierBalances(pool));
  console.log('After:', await totals());
} catch (e) {
  console.error(e?.message || e);
  process.exit(1);
} finally {
  await pool.end();
}
