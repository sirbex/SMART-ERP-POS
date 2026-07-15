#!/usr/bin/env node
/**
 * Architecture fitness — Loss & Quarantine domain (Gate A / Phase 2A).
 *
 * Usage:
 *   npm run ci:loss-quarantine-fitness
 *   npm run ci:loss-quarantine-fitness -- --strict
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STRICT = process.env.LOSS_QUARANTINE_CERT_STRICT === '1' || process.argv.includes('--strict');

const errors = [];
const warnings = [];

function fail(code, message) {
  errors.push(`[${code}] ${message}`);
}

function warn(code, message) {
  warnings.push(`[${code}] ${message}`);
}

const registryPath = path.join(
  ROOT,
  'SamplePOS.Server/src/modules/loss-quarantine/lossQuarantineTouchpointRegistry.ts',
);
if (!existsSync(registryPath)) {
  fail('A-02', 'lossQuarantineTouchpointRegistry.ts missing');
} else {
  const src = readFileSync(registryPath, 'utf8');
  const notStarted = (src.match(/status:\s*'NOT_STARTED'/g) ?? []).length;
  if (notStarted > 0) fail('A-03', `${notStarted} touchpoint(s) still NOT_STARTED`);
  if (!(src.match(/status:\s*'/g) ?? []).length) fail('A-02', 'Registry empty');
}

const required = [
  'shared/sql/545_loss_quarantine_foundation.sql',
  'shared/sql/547_drop_stock_movement_gl_trigger.sql',
  'shared/loss-quarantine/index.ts',
  'SamplePOS.Server/src/modules/loss-quarantine/lossQuarantineSettings.ts',
  'docs/architecture/LOSS_QUARANTINE_ADR.md',
];
for (const r of required) {
  if (!existsSync(path.join(ROOT, r))) fail('A-01', `Missing ${r}`);
}

const repair = path.join(ROOT, 'SamplePOS.Server/src/modules/system/glRepairService.ts');
if (existsSync(repair)) {
  const text = readFileSync(repair, 'utf8');
  if (!text.includes('posts_gl IS FALSE') || !text.includes('QUARANTINE_TRANSFER')) {
    fail('D-01', 'glRepairService missing LQ-INV-8 quarantine exclusions');
  }
}

const legacyGl = path.join(ROOT, 'SamplePOS.Server/src/services/glEntryService.ts');
if (existsSync(legacyGl)) {
  const text = readFileSync(legacyGl, 'utf8');
  if (!text.includes('ALLOW_LEGACY_STOCK_ADJUSTMENT_GL')) {
    fail('D-02', 'recordStockAdjustmentToGL missing legacy guard');
  }
}

const triggerSql = path.join(ROOT, 'shared/sql/547_drop_stock_movement_gl_trigger.sql');
if (existsSync(triggerSql)) {
  const text = readFileSync(triggerSql, 'utf8');
  if (!text.includes('DROP TRIGGER IF EXISTS trg_post_stock_movement_to_ledger')) {
    fail('D-03', '547 migration does not drop stock movement GL trigger');
  }
}

const invProvider = path.join(
  ROOT,
  'SamplePOS.Server/src/modules/financial-reconciliation/providers/inventoryReconciliationProvider.ts',
);
if (existsSync(invProvider)) {
  const text = readFileSync(invProvider, 'utf8');
  if (!text.includes('quarantine') || !text.includes('computeQuarantine')) {
    fail('D-04', 'Inventory provider missing quarantine aging lane');
  }
}

const adj = path.join(
  ROOT,
  'SamplePOS.Server/src/modules/inventory/warehouse/warehouseAdjustmentService.ts',
);
if (existsSync(adj)) {
  const text = readFileSync(adj, 'utf8');
  if (!text.includes("economicEvent: 'QUARANTINE_TRANSFER'")) {
    fail('A-04', 'DAMAGE quarantine path missing QUARANTINE_TRANSFER tag');
  }
  if (!text.includes('postsGl: false') && !text.includes('postsGl:false')) {
    fail('A-04', 'DAMAGE quarantine path missing postsGl: false');
  }
}

const routes = path.join(
  ROOT,
  'SamplePOS.Server/src/modules/loss-quarantine/lossQuarantineRoutes.ts',
);
if (existsSync(routes)) {
  const text = readFileSync(routes, 'utf8');
  if (!text.includes("requirePermission('accounting.manage')")) {
    fail('E-04', 'Disposal reverse missing elevated accounting.manage');
  }
}

const checklist = path.join(ROOT, 'samplepos.client/src/lib/financialCloseChecklist.ts');
if (existsSync(checklist)) {
  const text = readFileSync(checklist, 'utf8');
  if (!text.includes('step-quarantine-aging')) {
    fail('E-05', 'Period-close checklist missing quarantine aging step');
  }
}

if (STRICT) {
  const deferred = (readFileSync(registryPath, 'utf8').match(/status:\s*'DEFERRED'/g) ?? []).length;
  if (deferred > 0) {
    warn('A-03', `${deferred} touchpoint(s) still DEFERRED — expected none at Phase 2E certification`);
  }
}

console.log('═'.repeat(60));
console.log(' ci:loss-quarantine-fitness');
console.log(` mode: ${STRICT ? 'STRICT' : 'advisory'}`);
console.log('═'.repeat(60));

if (warnings.length) {
  console.log('\nWarnings:');
  for (const w of warnings) console.log(`  ⚠ ${w}`);
}
if (errors.length) {
  console.log('\nFailures:');
  for (const e of errors) console.log(`  ✗ ${e}`);
  process.exit(1);
}

console.log(`\n✓ Loss/Quarantine fitness PASS (${warnings.length} warning(s))`);
process.exit(0);
