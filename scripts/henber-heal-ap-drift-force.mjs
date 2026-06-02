#!/usr/bin/env node
/**
 * Henber — post AP drift correction with unique reference (avoids all-zero CORRECTION collision).
 * Uses deployed dist modules; safe to run before healAPDrift referenceId fix is deployed.
 */
import pg from 'pg';
import { v5 as uuidv5 } from 'uuid';
import { rebuildPeriodBalances, recalcAllSupplierBalances } from '/app/dist/SamplePOS.Server/src/modules/system/glRepairService.js';
import { computeApReconciliationSnapshot, apMaterialityThreshold, isApDriftExplainedByExpenses } from '/app/dist/SamplePOS.Server/src/modules/supplier-payments/apReconciliationEngine.js';
import { AccountingCore } from '/app/dist/SamplePOS.Server/src/services/accountingCore.js';
import { getBusinessDate } from '/app/dist/SamplePOS.Server/src/utils/dateRange.js';

const AP_DRIFT_HEAL_NS = 'a1b2c3d4-e5f6-4789-a012-3456789ab00';
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || '4971ceff-c094-41b0-bfaf-a3d88ea634a1';

function henberDatabaseUrl() {
  if (process.env.HENBER_DATABASE_URL) return process.env.HENBER_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (base) return base.replace(/\/([^/?]+)(\?.*)?$/, '/pos_tenant_henber_pharmacy$2');
  return 'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@postgres:5432/pos_tenant_henber_pharmacy';
}

const pool = new pg.Pool({ connectionString: henberDatabaseUrl() });
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function snapshot(label) {
  const s = await computeApReconciliationSnapshot(pool);
  console.log(`\n--- ${label} --- GL ${fmt(s.glBalance)} | Sub ${fmt(s.subledgerBalance)} | Drift ${fmt(s.drift)}`);
  return s;
}

try {
  console.log('Henber AP drift force-heal');
  const before = await snapshot('before');

  if (Math.abs(before.drift) < 0.02) {
    console.log('✅ Already balanced.');
    process.exit(0);
  }

  const threshold = apMaterialityThreshold(before.glBalance);
  if (isApDriftExplainedByExpenses(before, threshold)) {
    console.log('Drift explained by expense-on-AP — no heal needed.');
    process.exit(0);
  }

  console.log('\n→ recalcAllSupplierBalances...');
  console.log(await recalcAllSupplierBalances(pool));

  const snap = await computeApReconciliationSnapshot(pool);
  const drift = snap.drift;
  if (Math.abs(drift) < 0.02) {
    console.log('✅ Balanced after recalc.');
    process.exit(0);
  }

  const today = getBusinessDate();
  const idempotencyKey = `AP-DRIFT-HEAL-${today}`;
  const referenceId = uuidv5(idempotencyKey, AP_DRIFT_HEAL_NS);
  const absDrift = Math.abs(drift);
  const action = drift > 0 ? 'debit-ap' : 'credit-ap';
  const offsetCode = '5900';

  const lines = action === 'debit-ap'
    ? [
        { accountCode: '2100', debitAmount: absDrift, creditAmount: 0, description: 'AP drift correction (reduce overstated liability)' },
        { accountCode: offsetCode, debitAmount: 0, creditAmount: absDrift, description: 'AP drift correction (offset to GL adjustments)' },
      ]
    : [
        { accountCode: offsetCode, debitAmount: absDrift, creditAmount: 0, description: 'AP drift correction (offset to GL adjustments)' },
        { accountCode: '2100', debitAmount: 0, creditAmount: absDrift, description: 'AP drift correction (recognise understated liability)' },
      ];

  console.log(`\n→ Posting ${action} ${fmt(absDrift)} (ref ${referenceId})...`);
  const tx = await AccountingCore.createJournalEntry({
    entryDate: today,
    description: `AP drift correction: align GL 2100 (${snap.glBalance.toFixed(2)}) to open-item subledger (${snap.subledgerBalance.toFixed(2)}); drift=${drift.toFixed(2)}`,
    referenceType: 'CORRECTION',
    referenceId,
    referenceNumber: idempotencyKey,
    idempotencyKey,
    userId: ADMIN_USER_ID,
    lines,
    source: 'SYSTEM_CORRECTION',
  }, pool);
  console.log('Posted:', tx.transactionNumber, tx.transactionId);

  console.log('\n→ rebuildPeriodBalances...');
  console.log(await rebuildPeriodBalances(pool));

  const after = await snapshot('after');
  if (Math.abs(after.drift) > 0.02) {
    console.error('❌ Drift remains:', fmt(after.drift));
    process.exit(1);
  }
  console.log('\n✅ AP drift healed.');
} catch (e) {
  console.error('ERR', e?.message || e);
  process.exit(1);
} finally {
  await pool.end();
}
