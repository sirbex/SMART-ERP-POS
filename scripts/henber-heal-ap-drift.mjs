#!/usr/bin/env node
/**
 * Henber — fix AP GL drift: recalc supplier caches, heal GL 2100 to open-item subledger, rebuild GPB.
 * Run inside smarterp-backend container.
 */
import pg from 'pg';
import {
  recalcAllSupplierBalances,
  rebuildPeriodBalances,
  healAPDrift,
  runGLIntegrityCheck,
} from '/app/dist/SamplePOS.Server/src/modules/system/glRepairService.js';
import { computeApReconciliationSnapshot } from '/app/dist/SamplePOS.Server/src/modules/supplier-payments/apReconciliationEngine.js';

function henberDatabaseUrl() {
  if (process.env.HENBER_DATABASE_URL) return process.env.HENBER_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (base) {
    return base.replace(/\/([^/?]+)(\?.*)?$/, '/pos_tenant_henber_pharmacy$2');
  }
  return 'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@postgres:5432/pos_tenant_henber_pharmacy';
}

const ADMIN_USER_ID = process.env.ADMIN_USER_ID || '4971ceff-c094-41b0-bfaf-a3d88ea634a1';
const pool = new pg.Pool({ connectionString: henberDatabaseUrl() });

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function printAp(label) {
  const s = await computeApReconciliationSnapshot(pool);
  console.log(`\n--- AP ${label} ---`);
  console.log(`  GL:        ${fmt(s.glBalance)}`);
  console.log(`  Subledger: ${fmt(s.subledgerBalance)}`);
  console.log(`  Drift:     ${fmt(s.drift)}`);
  return s;
}

try {
  console.log('Henber AP heal');
  console.log('DB:', henberDatabaseUrl().replace(/\/\/[^@]+@/, '//***@'));
  console.log('Admin:', ADMIN_USER_ID);

  const before = await printAp('before');

  console.log('\n→ recalcAllSupplierBalances...');
  console.log(await recalcAllSupplierBalances(pool));

  const afterRecalc = await printAp('after recalc');
  if (Math.abs(afterRecalc.drift) < 0.02) {
    console.log('\n✅ Drift cleared after recalc — skipping heal-ap-drift.');
  } else {
    console.log('\n→ healAPDrift...');
    const heal = await healAPDrift(pool, ADMIN_USER_ID);
    console.log(heal);
    if (heal.action === 'no-op') {
      console.log('  (no-op — drift below threshold or explained by expenses)');
    }
  }

  console.log('\n→ rebuildPeriodBalances...');
  console.log(await rebuildPeriodBalances(pool));

  const after = await printAp('after heal + GPB');
  const integrity = await runGLIntegrityCheck(pool);
  console.log('\n--- GL integrity ---');
  console.log('  Status:', integrity.systemStatus);
  console.log('  AP:', integrity.checks.apReconciliation);

  if (Math.abs(after.drift) > 0.02 && !integrity.checks.apReconciliation.isBalanced) {
    console.error('\n❌ AP drift remains after heal');
    process.exit(1);
  }
  console.log('\n✅ AP heal complete.');
} catch (e) {
  console.error('ERR', e?.message || e);
  if (e?.stack) console.error(e.stack);
  process.exit(1);
} finally {
  await pool.end();
}
