#!/usr/bin/env node
/**
 * Henber — rebuild GPB, repost missing GL, recalc suppliers, heal AP if needed.
 * Run inside smarterp-backend: see .github/workflows/henber-heal-report-integrity.yml
 */
import pg from 'pg';
import {
  repostAllMissingGL,
  rebuildPeriodBalances,
  recalcAllSupplierBalances,
  runGLIntegrityCheck,
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

async function resolveAdminUserId(client) {
  if (process.env.ADMIN_USER_ID) return process.env.ADMIN_USER_ID;
  const res = await client.query(
    `SELECT id FROM users WHERE is_active = true ORDER BY created_at ASC LIMIT 1`,
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error('No active user in pos_tenant_henber_pharmacy for audit trail');
  return id;
}

try {
  const adminUserId = await resolveAdminUserId(pool);
  console.log('Henber DB:', henberDatabaseUrl().replace(/\/\/[^@]+@/, '//***@'));
  console.log('Admin user:', adminUserId);

  const before = await runGLIntegrityCheck(pool);
  console.log('\nBefore:', before.systemStatus, {
    ap: before.checks.apReconciliation,
    inv: before.checks.inventoryReconciliation,
  });
  if (before.alerts.length) console.log('Alerts:', before.alerts.join(' | '));

  console.log('\n→ repostAllMissingGL...');
  const repair = await repostAllMissingGL(pool);
  console.log('  ', repair.summary);

  console.log('\n→ rebuildPeriodBalances...');
  const gpb = await rebuildPeriodBalances(pool);
  console.log('  ', gpb);

  console.log('\n→ recalcAllSupplierBalances...');
  const sup = await recalcAllSupplierBalances(pool);
  console.log('  ', sup);

  // Do NOT run healAPDrift — it uses suppliers.OutstandingBalance, not invoice subledger
  // (Report Integrity uses financialIntegrityService.checkAP). GPB rebuild is the fix
  // for "Balance sheet totals table matches ledger".

  const after = await runGLIntegrityCheck(pool);
  console.log('\nAfter:', after.systemStatus, {
    ap: after.checks.apReconciliation,
    inv: after.checks.inventoryReconciliation,
  });
  if (after.alerts.length) console.log('Alerts:', after.alerts.join(' | '));

  console.log('\nOK: GPB rebuilt. Re-check Report Integrity in UI (AP may need invoice repost, not AP heal).');
} catch (e) {
  console.error(e?.message || e);
  process.exit(1);
} finally {
  await pool.end();
}
