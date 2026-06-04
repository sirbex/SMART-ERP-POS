#!/usr/bin/env node
/**
 * Henber — SALUD AP proof: Performance outstanding = Ledger outstanding (SSOT).
 * Exit 0 only when aligned.
 */
import pg from 'pg';

function henberDatabaseUrl() {
  if (process.env.HENBER_DATABASE_URL) return process.env.HENBER_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (base) return base.replace(/\/([^/?]+)(\?.*)?$/, '/pos_tenant_henber_pharmacy$2');
  return 'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@postgres:5432/pos_tenant_henber_pharmacy';
}

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
const pool = new pg.Pool({ connectionString: henberDatabaseUrl() });

function fail(msg) {
  console.error('PROOF FAIL:', msg);
  process.exitCode = 1;
}

function pass(msg) {
  console.log('PROOF PASS:', msg);
}

try {
  const sup = await pool.query(
    `SELECT "Id", "CompanyName", COALESCE("OutstandingBalance", 0) AS cached
     FROM suppliers WHERE "CompanyName" ILIKE '%SALUD%' LIMIT 1`,
  );
  const row = sup.rows[0];
  if (!row) throw new Error('SALUD supplier not found');
  const supplierId = row.Id;
  console.log('Supplier:', row.CompanyName, supplierId);

  const { repairSupplierInvoiceOutstandingFromLedger } = await import(
    '/app/dist/SamplePOS.Server/src/modules/supplier-payments/supplierPaymentRepository.js'
  );
  const { syncSupplierBalanceFromOpenItems, computeSupplierOpenItemBalance } = await import(
    '/app/dist/SamplePOS.Server/src/modules/supplier-payments/apReconciliationEngine.js'
  );
  const { getSmartSupplierStatementData } = await import(
    '/app/dist/SamplePOS.Server/src/modules/reports/cnDnReportService.js'
  );

  let invRepair = { repaired: 0, scanned: 0 };
  if (process.argv.includes('--heal')) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      invRepair = await repairSupplierInvoiceOutstandingFromLedger(client, supplierId);
      const sync = await syncSupplierBalanceFromOpenItems(client, supplierId, 'SALUD_PROOF');
      await client.query('COMMIT');
      console.log('Repair:', invRepair, 'Cache sync:', sync);
    } finally {
      client.release();
    }
  }

  const freshCache = await pool.query(
    `SELECT COALESCE("OutstandingBalance", 0) AS cached FROM suppliers WHERE "Id" = $1`,
    [supplierId],
  );
  const cached = Number(freshCache.rows[0]?.cached ?? row.cached);

  const openItem = await computeSupplierOpenItemBalance(pool, supplierId);
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = `${Number(endDate.slice(0, 4)) - 1}${endDate.slice(4)}`;
  const stmt = await getSmartSupplierStatementData(pool, supplierId, startDate, endDate);

  const perfOutstanding = openItem.openItemBalance;
  const ledgerOutstanding = stmt.closingBalance;
  const ledgerOpenItemField = stmt.openItemBalance;

  console.log('\n=== SALUD AP PROOF ===');
  console.table({
    performance_open_item: fmt(perfOutstanding),
    ledger_closing_balance: fmt(ledgerOutstanding),
    ledger_open_item_field: fmt(ledgerOpenItemField),
    supplier_cache: fmt(cached),
    invoice_open: fmt(openItem.invoiceOpen),
    unallocated_payments: fmt(openItem.unallocatedPayments),
    invoices_repaired: invRepair.repaired,
  });

  const tol = 0.02;
  if (Math.abs(perfOutstanding - ledgerOutstanding) > tol) {
    fail(`Performance (${perfOutstanding}) != Ledger closing (${ledgerOutstanding})`);
  } else {
    pass(`Performance outstanding = Ledger outstanding (${fmt(perfOutstanding)})`);
  }

  if (Math.abs(ledgerOutstanding - ledgerOpenItemField) > tol) {
    fail(`Ledger closing != openItemBalance field`);
  } else {
    pass('Ledger closingBalance === openItemBalance in API');
  }

  if (Math.abs(cached - perfOutstanding) > tol) {
    fail(`Supplier cache (${cached}) != open-item (${perfOutstanding})`);
  } else {
    pass('Supplier cache matches open-item SSOT');
  }

  const periodNet = stmt.entries.reduce((s, e) => s + e.debit - e.credit, 0);
  const impliedClosing = stmt.openingBalance + periodNet;
  if (Math.abs(impliedClosing - ledgerOutstanding) > tol) {
    fail(`Period math: opening (${stmt.openingBalance}) + net (${periodNet}) != closing (${ledgerOutstanding})`);
  } else {
    pass('Ledger period math: opening + debits − credits = outstanding');
  }

  if (process.exitCode === 1) {
    console.log('\n=== PROOF FAILED ===');
    process.exit(1);
  }
  console.log('\n=== PROOF CONFIRMED: SALUD AP ALIGNED ===');
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await pool.end();
}
