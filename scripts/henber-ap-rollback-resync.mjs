#!/usr/bin/env node
/**
 * Rollback mistaken henber-ap-fix-unallocated invoice resync (2026-05-29)
 * and apply ONLY targeted allocation for PAY-000292 (MUSA SSEMANDA, 350k).
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

/** Captured from dry-run immediately before bad resync (2026-05-29). */
const ROLLBACK_BY_INVOICE_NUMBER = [
  { num: 'SBILL-2026-0243', amountPaid: 1120000, outstanding: 0, status: 'PAID' },
  { num: 'SBILL-2026-0284', amountPaid: 269500, outstanding: 633932, status: 'PARTIALLY_PAID' },
  { num: 'SBILL-2026-0054', amountPaid: 227520, outstanding: 475322, status: 'Pending' },
  { num: 'SBILL-2026-0064', amountPaid: 155000, outstanding: 317117, status: 'Pending' },
  { num: 'SBILL-2026-0088', amountPaid: 102500, outstanding: 208500, status: 'Pending' },
  { num: 'SBILL-2026-0267', amountPaid: 100000, outstanding: 352800, status: 'PARTIALLY_PAID' },
  { num: 'SBILL-2026-0245', amountPaid: 74060, outstanding: 0, status: 'PAID' },
  { num: 'SBILL-2026-0019', amountPaid: 70000, outstanding: 0, status: 'Paid' },
  { num: 'SBILL-2026-0168', amountPaid: 55500, outstanding: 450380, status: 'Pending' },
  { num: 'SBILL-2026-0001', amountPaid: 1740000, outstanding: 0, status: 'Paid' },
  { num: 'SBILL-2026-0043', amountPaid: 160217, outstanding: 498321, status: 'PartiallyPaid' },
];

const PAY_000292_ID = 'c490509e-e682-477e-9944-cdbaedc1bf08';

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
  console.log('Henber AP rollback + PAY-000292 allocate');
  console.log('DB:', henberDatabaseUrl().replace(/\/\/[^@]+@/, '//***@'));
  console.log('\nBefore:', await totals());

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let rolled = 0;
    for (const row of ROLLBACK_BY_INVOICE_NUMBER) {
      const res = await client.query(
        `UPDATE supplier_invoices
         SET "AmountPaid" = $1, "OutstandingBalance" = $2, "Status" = $3, "UpdatedAt" = NOW()
         WHERE "SupplierInvoiceNumber" = $4 AND deleted_at IS NULL
         RETURNING "Id"`,
        [row.amountPaid, row.outstanding, row.status, row.num],
      );
      if (res.rowCount) rolled += res.rowCount;
    }
    console.log(`\n→ Restored ${rolled} invoice(s) from pre-resync snapshot`);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const pay = await pool.query(
    `SELECT "Id", "PaymentNumber", "Amount", "AllocatedAmount", "UnallocatedAmount", "Status"
     FROM supplier_payments WHERE "Id" = $1 OR "PaymentNumber" = 'PAY-000292' LIMIT 1`,
    [PAY_000292_ID],
  );
  const p = pay.rows[0];
  if (!p) {
    console.log('\n⚠ PAY-000292 not found — skip allocate');
  } else {
    console.log('\nPAY-000292:', p);
    const unalloc = Number(p.UnallocatedAmount ?? p.Amount - (p.AllocatedAmount || 0));
    if (unalloc > 0.01) {
      await autoAllocatePayment(pool, p.Id);
      console.log(`→ Auto-allocated PAY-000292 (${unalloc.toFixed(2)})`);
    } else {
      console.log('→ PAY-000292 already fully allocated in payment header');
    }
  }

  console.log('\n→ recalcAllSupplierBalances...', await recalcAllSupplierBalances(pool));
  console.log('\nAfter:', await totals());
  console.log('\nOK — refresh Report Integrity AP details.');
} catch (e) {
  console.error(e?.message || e);
  process.exit(1);
} finally {
  await pool.end();
}
