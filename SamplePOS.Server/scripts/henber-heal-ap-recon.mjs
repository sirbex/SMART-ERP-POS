#!/usr/bin/env node
/**
 * Henber production — repair invoice OB from ledger, sync supplier caches,
 * align credit-balance suppliers with GL entity, verify reconciliation.
 *
 * Usage (inside smarterp-backend or locally with tsx):
 *   node scripts/henber-heal-ap-recon.mjs
 *   HENBER_DATABASE_URL=postgresql://... npx tsx scripts/heal-supplier-open-item-balances.ts
 */
import pg from 'pg';

function henberDatabaseUrl() {
  if (process.env.HENBER_DATABASE_URL) return process.env.HENBER_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (base) return base.replace(/\/([^/?]+)(\?.*)?$/, '/pos_tenant_henber_pharmacy$2');
  throw new Error('Set HENBER_DATABASE_URL or DATABASE_URL');
}

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

async function loadHealFns() {
  try {
    const repo = await import(
      '../src/modules/supplier-payments/supplierPaymentRepository.js'
    );
    const ap = await import('../src/modules/supplier-payments/apReconciliationEngine.js');
    return {
      repairSupplierInvoiceOutstandingFromLedger: repo.repairSupplierInvoiceOutstandingFromLedger,
      syncSupplierBalanceFromOpenItems: ap.syncSupplierBalanceFromOpenItems,
      mode: 'tsx',
    };
  } catch {
    const repo = await import(
      '/app/dist/SamplePOS.Server/src/modules/supplier-payments/supplierPaymentRepository.js'
    );
    const ap = await import(
      '/app/dist/SamplePOS.Server/src/modules/supplier-payments/apReconciliationEngine.js'
    );
    return {
      repairSupplierInvoiceOutstandingFromLedger: repo.repairSupplierInvoiceOutstandingFromLedger,
      syncSupplierBalanceFromOpenItems: ap.syncSupplierBalanceFromOpenItems,
      mode: 'docker',
    };
  }
}

async function reconciliationSnapshot(pool) {
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
    supplier_table AS (
      SELECT COALESCE(SUM("OutstandingBalance"), 0) AS balance FROM suppliers
    )
    SELECT gl_supplier.balance::numeric AS gl_balance,
           supplier_table.balance::numeric AS subledger
    FROM gl_supplier, supplier_table
  `);
  const gl = Number(r.rows[0].gl_balance);
  const sub = Number(r.rows[0].subledger);
  return { gl, sub, diff: gl - sub };
}

async function perSupplierDrifts(pool) {
  const r = await pool.query(`
    SELECT s."CompanyName" AS supplier,
           COALESCE(gl.net, 0)::numeric AS gl_entity,
           COALESCE(s."OutstandingBalance", 0)::numeric AS cache,
           (COALESCE(gl.net, 0) - COALESCE(s."OutstandingBalance", 0))::numeric AS diff
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
    WHERE ABS(COALESCE(gl.net, 0) - COALESCE(s."OutstandingBalance", 0)) > 0.01
    ORDER BY ABS(COALESCE(gl.net, 0) - COALESCE(s."OutstandingBalance", 0)) DESC
  `);
  return r.rows;
}

async function alignCreditBalanceSuppliers(client) {
  const r = await client.query(`
    UPDATE suppliers s
    SET "OutstandingBalance" = sub.gl_net,
        "UpdatedAt" = NOW()
    FROM (
      SELECT s2."Id" AS id,
             COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS gl_net
      FROM suppliers s2
      LEFT JOIN ledger_entries le ON le."EntityId"::text = s2."Id"::text
        AND UPPER(le."EntityType") = 'SUPPLIER'
      LEFT JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      LEFT JOIN accounts a ON a."Id" = le."AccountId" AND a."AccountCode" = '2100'
      WHERE lt."Status" = 'POSTED' OR lt."Id" IS NULL
      GROUP BY s2."Id"
      HAVING COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) < -0.009
    ) sub
    WHERE s."Id" = sub.id
      AND ABS(s."OutstandingBalance" - sub.gl_net) > 0.01
    RETURNING s."CompanyName", s."OutstandingBalance"::numeric AS new_balance
  `);
  return r.rows;
}

const pool = new pg.Pool({ connectionString: henberDatabaseUrl() });

try {
  console.log('Henber AP reconciliation heal');
  console.log('DB:', henberDatabaseUrl().replace(/\/\/[^@]+@/, '//***@'));

  const before = await reconciliationSnapshot(pool);
  console.log('\nBEFORE:', {
    gl: fmt(before.gl),
    subledger: fmt(before.sub),
    diff: fmt(before.diff),
  });
  const driftsBefore = await perSupplierDrifts(pool);
  if (driftsBefore.length) {
    console.log('Per-supplier drifts:');
    console.table(
      driftsBefore.map((d) => ({
        supplier: d.supplier,
        gl: fmt(d.gl_entity),
        cache: fmt(d.cache),
        diff: fmt(d.diff),
      })),
    );
  }

  const { repairSupplierInvoiceOutstandingFromLedger, syncSupplierBalanceFromOpenItems, mode } =
    await loadHealFns();
  console.log(`\nHeal mode: ${mode}`);

  const suppliers = await pool.query(`SELECT "Id", "CompanyName" FROM suppliers ORDER BY "CompanyName"`);
  const client = await pool.connect();
  let invoicesRepaired = 0;
  let suppliersChanged = 0;

  try {
    await client.query('BEGIN');
    for (const row of suppliers.rows) {
      const inv = await repairSupplierInvoiceOutstandingFromLedger(client, row.Id);
      invoicesRepaired += inv.repaired;
      const { oldBalance, newBalance } = await syncSupplierBalanceFromOpenItems(
        client,
        row.Id,
        'HENBER_AP_RECON_HEAL',
      );
      if (inv.repaired > 0 || Math.abs(oldBalance - newBalance) > 0.01) {
        suppliersChanged++;
        console.log(
          `  ${row.CompanyName}: invoices ${inv.repaired}/${inv.scanned}, cache ${fmt(oldBalance)} → ${fmt(newBalance)}`,
        );
      }
    }
    const creditAligned = await alignCreditBalanceSuppliers(client);
    for (const row of creditAligned) {
      console.log(`  Credit balance aligned: ${row.CompanyName} → ${fmt(row.new_balance)}`);
    }
    await client.query('COMMIT');
    console.log(
      `\nHealed ${suppliersChanged} supplier(s); ${invoicesRepaired} invoice row(s) repaired.`,
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const after = await reconciliationSnapshot(pool);
  console.log('\nAFTER:', {
    gl: fmt(after.gl),
    subledger: fmt(after.sub),
    diff: fmt(after.diff),
    status: Math.abs(after.diff) < 0.02 ? 'RECONCILED' : 'DISCREPANCY',
  });
  const driftsAfter = await perSupplierDrifts(pool);
  if (driftsAfter.length) {
    console.log('Remaining per-supplier drifts:');
    console.table(
      driftsAfter.map((d) => ({
        supplier: d.supplier,
        gl: fmt(d.gl_entity),
        cache: fmt(d.cache),
        diff: fmt(d.diff),
      })),
    );
  } else {
    console.log('\n✅ All suppliers GL entity = cache');
  }

  if (Math.abs(after.diff) >= 0.02) {
    console.error('\n❌ Tenant-level reconciliation drift remains');
    process.exit(1);
  }
  console.log('\n✅ AP reconciliation heal complete.');
} catch (e) {
  console.error('ERR', e?.message || e);
  if (e?.stack) console.error(e.stack);
  process.exit(1);
} finally {
  await pool.end();
}
