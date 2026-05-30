#!/usr/bin/env node
/**
 * Henber — align supplier AP displays: recalc caches, rebuild GPB, print reconciliation.
 */
import pg from 'pg';
import {
  rebuildPeriodBalances,
  recalcAllSupplierBalances,
} from '/app/dist/SamplePOS.Server/src/modules/system/glRepairService.js';

function henberDatabaseUrl() {
  if (process.env.HENBER_DATABASE_URL) return process.env.HENBER_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (base) {
    return base.replace(/\/([^/?]+)(\?.*)?$/, '/pos_tenant_henber_pharmacy$2');
  }
  return 'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@postgres:5432/pos_tenant_henber_pharmacy';
}

const pool = new pg.Pool({ connectionString: henberDatabaseUrl() });

async function snapshot(label) {
  const r = await pool.query(`
    WITH invoice_ap AS (
      SELECT GREATEST(COALESCE(SUM(
        CASE WHEN document_type = 'SUPPLIER_CREDIT_NOTE'
          THEN -COALESCE("OutstandingBalance", 0)
          ELSE COALESCE("OutstandingBalance", 0) END
      ), 0), 0) AS v
      FROM supplier_invoices
      WHERE deleted_at IS NULL
        AND UPPER("Status") NOT IN ('PAID', 'CANCELLED', 'DELETED')
    ),
    supplier_sum AS (
      SELECT COALESCE(SUM("OutstandingBalance"), 0) AS v FROM suppliers
    ),
    gpb_2100 AS (
      SELECT COALESCE(SUM(gpb.credit_total) - SUM(gpb.debit_total), 0) AS v
      FROM gl_period_balances gpb
      JOIN accounts a ON a."Id" = gpb.account_id
      WHERE a."AccountCode" = '2100'
    ),
    ledger_2100 AS (
      SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS v
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '2100'
        AND lt."Status" = 'POSTED'
        AND COALESCE(lt."IsReversed", false) = false
    ),
    supplier_gl AS (
      SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS v
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '2100'
        AND UPPER(le."EntityType") = 'SUPPLIER'
        AND lt."Status" = 'POSTED'
        AND COALESCE(lt."IsReversed", false) = false
    )
    SELECT
      (SELECT v FROM invoice_ap) AS invoice_subledger,
      (SELECT v FROM supplier_sum) AS suppliers_cached,
      (SELECT v FROM gpb_2100) AS gpb_2100,
      (SELECT v FROM ledger_2100) AS ledger_2100,
      (SELECT v FROM supplier_gl) AS supplier_gl_entity
  `);
  const row = r.rows[0];
  console.log(`\n--- ${label} ---`);
  console.table([row]);
  return row;
}

try {
  console.log('DB:', henberDatabaseUrl().replace(/\/\/[^@]+@/, '//***@'));
  await snapshot('Before');

  console.log('\n→ recalcAllSupplierBalances...');
  console.log(await recalcAllSupplierBalances(pool));

  console.log('\n→ rebuildPeriodBalances...');
  console.log(await rebuildPeriodBalances(pool));

  await snapshot('After');
  console.log('\nDashboard AP card should match invoice_subledger after deploy.');
} catch (e) {
  console.error(e?.message || e);
  process.exit(1);
} finally {
  await pool.end();
}
