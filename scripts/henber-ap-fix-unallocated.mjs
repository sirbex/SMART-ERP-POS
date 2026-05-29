#!/usr/bin/env node
/**
 * Henber AP fix — sync invoice paid amounts from allocations, auto-allocate unallocated
 * payments, then recalc supplier balances. Does NOT run healAPDrift.
 *
 *   DRY_RUN=1 node henber-ap-fix-unallocated.mjs   # preview only
 *   node henber-ap-fix-unallocated.mjs             # apply
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

async function totals(client) {
  const res = await client.query(`
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
    )
    SELECT gs.balance AS supplier_gl, st.balance AS suppliers_sum,
           gs.balance - st.balance AS gap
    FROM gl_supplier gs, supplier_table st
  `);
  return res.rows[0];
}

try {
  console.log('Henber AP fix | DRY_RUN=', DRY_RUN);
  console.log('DB:', henberDatabaseUrl().replace(/\/\/[^@]+@/, '//***@'));

  const before = await totals(pool);
  console.log('\nBefore:', before);

  const mismatched = await pool.query(`
    WITH alloc AS (
      SELECT spa."SupplierInvoiceId", SUM(spa."AmountAllocated") AS paid_from_allocs
      FROM supplier_payment_allocations spa
      WHERE spa.deleted_at IS NULL
      GROUP BY spa."SupplierInvoiceId"
    )
    SELECT
      si."Id",
      si."SupplierInvoiceNumber",
      s."CompanyName" AS supplier,
      si."AmountPaid"::numeric AS amount_paid,
      COALESCE(a.paid_from_allocs, 0)::numeric AS paid_from_allocs,
      si."OutstandingBalance"::numeric AS outstanding
    FROM supplier_invoices si
    JOIN suppliers s ON s."Id" = si."SupplierId"
    LEFT JOIN alloc a ON a."SupplierInvoiceId" = si."Id"
    WHERE si.deleted_at IS NULL
      AND ABS(COALESCE(si."AmountPaid", 0) - COALESCE(a.paid_from_allocs, 0)) > 0.01
    ORDER BY ABS(COALESCE(si."AmountPaid", 0) - COALESCE(a.paid_from_allocs, 0)) DESC
  `);

  console.log(`\nInvoices with AmountPaid != allocation sum: ${mismatched.rows.length}`);
  if (mismatched.rows.length > 0) {
    console.table(mismatched.rows.slice(0, 15));
  }

  const unallocated = await pool.query(`
    SELECT
      sp."Id",
      sp."PaymentNumber",
      sp."PaymentDate"::date,
      s."CompanyName" AS supplier,
      sp."Amount"::numeric AS amount,
      COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0))::numeric AS unallocated
    FROM supplier_payments sp
    JOIN suppliers s ON s."Id" = sp."SupplierId"
    WHERE UPPER(sp."Status") NOT IN ('CANCELLED', 'VOID', 'DELETED')
      AND COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0)) > 0.01
    ORDER BY unallocated DESC
  `);

  console.log(`\nUnallocated payments: ${unallocated.rows.length}`);
  const totalUnalloc = unallocated.rows.reduce((s, r) => s + Number(r.unallocated), 0);
  console.log(`Total unallocated: ${totalUnalloc.toFixed(2)}`);
  if (unallocated.rows.length > 0) {
    console.table(unallocated.rows.slice(0, 15));
  }

  if (DRY_RUN) {
    console.log('\nDRY_RUN — no changes applied.');
    process.exit(0);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let invoicesFixed = 0;
    for (const row of mismatched.rows) {
      const paid = Number(row.paid_from_allocs);
      const totalRes = await client.query(
        `SELECT "TotalAmount"::numeric AS total FROM supplier_invoices WHERE "Id" = $1`,
        [row.Id],
      );
      const total = Number(totalRes.rows[0]?.total || 0);
      const outstanding = Math.max(total - paid, 0);
      let status = 'Pending';
      if (paid >= total - 0.01) status = 'Paid';
      else if (paid > 0) status = 'PartiallyPaid';

      await client.query(
        `UPDATE supplier_invoices
         SET "AmountPaid" = $1, "OutstandingBalance" = $2, "Status" = $3, "UpdatedAt" = NOW()
         WHERE "Id" = $4`,
        [paid, outstanding, status, row.Id],
      );
      invoicesFixed++;
    }
    console.log(`\n→ Resynced ${invoicesFixed} invoice(s) from allocation sums`);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  let allocOk = 0;
  let allocSkip = 0;
  for (const pay of unallocated.rows) {
    try {
      await autoAllocatePayment(pool, pay.Id);
      allocOk++;
      console.log(`  Auto-allocated ${pay.PaymentNumber} (${Number(pay.unallocated).toFixed(2)})`);
    } catch (e) {
      allocSkip++;
      console.log(`  Skip ${pay.PaymentNumber}: ${e?.message || e}`);
    }
  }
  console.log(`\n→ Auto-allocate: ${allocOk} ok, ${allocSkip} skipped`);

  const recalc = await recalcAllSupplierBalances(pool);
  console.log('→ recalcAllSupplierBalances:', recalc);

  const after = await totals(pool);
  console.log('\nAfter:', after);
  console.log('\nOK — refresh Report Integrity AP details.');
} catch (e) {
  console.error(e?.message || e);
  process.exit(1);
} finally {
  await pool.end();
}
