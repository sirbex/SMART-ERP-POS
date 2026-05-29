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
  healAPDrift,
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

  const apBeforeHeal = await runGLIntegrityCheck(pool);
  const apDiff = Math.abs(apBeforeHeal.checks.apReconciliation.difference);
  const apMat = Math.max(5000, Math.abs(apBeforeHeal.checks.apReconciliation.glBalance) * 0.0001);
  if (apDiff > apMat) {
    console.log('\n→ healAPDrift (material AP drift remains)...');
    const apHeal = await healAPDrift(pool, adminUserId);
    console.log('  ', apHeal);
  } else {
    console.log('\n→ healAPDrift skipped (within tolerance after repair + recalc)');
  }

  const after = await runGLIntegrityCheck(pool);
  console.log('\nAfter:', after.systemStatus, {
    ap: after.checks.apReconciliation,
    inv: after.checks.inventoryReconciliation,
  });
  if (after.alerts.length) console.log('Alerts:', after.alerts.join(' | '));

  const apOk = after.checks.apReconciliation.isBalanced;
  const invOk = after.checks.inventoryReconciliation.isBalanced;
  if (!apOk || !invOk) {
    console.error('FAIL: subledger checks still drifting');
    process.exit(1);
  }
  console.log('\nOK: AP and inventory subledgers balanced (re-run Report Integrity for GPB table check)');
} catch (e) {
  console.error(e?.message || e);
  process.exit(1);
} finally {
  await pool.end();
}
