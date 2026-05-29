#!/usr/bin/env node
/**
 * Henber AP fix — ONLY auto-allocate unallocated supplier payments + recalc.
 * Never blindly resync AmountPaid from allocation rows (breaks legacy invoice paid amounts).
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
    )
    SELECT gs.balance AS supplier_gl, st.balance AS suppliers_sum,
           gs.balance - st.balance AS gap
    FROM gl_supplier gs, supplier_table st
  `);
  return res.rows[0];
}

try {
  console.log('Henber AP allocate-only fix | DRY_RUN=', DRY_RUN);
  console.log('Before:', await totals());

  const unallocated = await pool.query(`
    SELECT sp."Id", sp."PaymentNumber", sp."SupplierId",
           COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0))::numeric AS unallocated
    FROM supplier_payments sp
    WHERE UPPER(sp."Status") NOT IN ('CANCELLED', 'VOID', 'DELETED')
      AND COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0)) > 0.01
    ORDER BY unallocated DESC
  `);

  console.log(`Unallocated payments: ${unallocated.rows.length}`);
  console.table(unallocated.rows);

  if (DRY_RUN) {
    console.log('DRY_RUN — no changes.');
    process.exit(0);
  }

  let ok = 0;
  let skip = 0;
  for (const pay of unallocated.rows) {
    try {
      await autoAllocatePayment(pool, pay.Id);
      ok++;
      console.log(`  Allocated ${pay.PaymentNumber}: ${Number(pay.unallocated).toFixed(2)}`);
    } catch (e) {
      skip++;
      console.log(`  Skip ${pay.PaymentNumber}: ${e?.message || e}`);
    }
  }
  console.log(`→ ${ok} allocated, ${skip} skipped`);
  console.log('→ recalcAllSupplierBalances:', await recalcAllSupplierBalances(pool));
  console.log('After:', await totals());
} catch (e) {
  console.error(e?.message || e);
  process.exit(1);
} finally {
  await pool.end();
}
