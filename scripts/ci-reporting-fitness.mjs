#!/usr/bin/env node
/**
 * Architecture fitness — Cross-domain Reporting (Gate A / Phase 5A).
 *
 * Usage:
 *   npm run ci:reporting-fitness
 *   npm run ci:reporting-fitness -- --strict
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STRICT =
  process.env.REPORTING_CERT_STRICT === '1' || process.argv.includes('--strict');

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
  'SamplePOS.Server/src/modules/reporting/reportingTouchpointRegistry.ts',
);
if (!existsSync(registryPath)) {
  fail('A-02', 'reportingTouchpointRegistry.ts missing');
} else {
  const src = readFileSync(registryPath, 'utf8');
  const notStarted = (src.match(/status:\s*'NOT_STARTED'/g) ?? []).length;
  if (notStarted > 0) fail('A-03', `${notStarted} touchpoint(s) still NOT_STARTED`);
  if (!(src.match(/status:\s*'/g) ?? []).length) fail('A-02', 'Registry empty');
  for (const id of ['RP01', 'RP04', 'RP05', 'RP06', 'RP07', 'RP09', 'RP13', 'RP14']) {
    if (!src.includes(`id: '${id}'`)) fail('A-02', `Missing touchpoint ${id}`);
  }
}

const required = [
  'shared/reporting/index.ts',
  'shared/reporting/reportingTypes.ts',
  'shared/reporting/reportingInvariants.ts',
  'SamplePOS.Server/src/modules/reporting/reportingTouchpointRegistry.ts',
  'docs/architecture/REPORTING_ADR.md',
  'docs/architecture/REPORTING_INVARIANTS.md',
  'docs/architecture/REPORTING_PHASE5_ROADMAP.md',
  'PROOF_REPORTING_CHARTER.md',
  'PROOF_PNL_SSOT.md',
  'PROOF_TAX_COMPLIANCE.md',
];
for (const r of required) {
  if (!existsSync(path.join(ROOT, r))) fail('A-01', `Missing ${r}`);
}

const adr = path.join(ROOT, 'docs/architecture/REPORTING_ADR.md');
if (existsSync(adr)) {
  const text = readFileSync(adr, 'utf8');
  if (!/\*\*Status:\*\* Accepted/i.test(text)) {
    fail('A-01', 'ADR-007 not Accepted');
  }
  if (!text.includes('Freeze financial reporting around declared Single Sources of Truth')) {
    fail('A-01', 'ADR-007 missing freeze statement');
  }
}

const erp = path.join(ROOT, 'SamplePOS.Server/src/routes/erpAccountingRoutes.ts');
if (existsSync(erp)) {
  const text = readFileSync(erp, 'utf8');
  if (!text.includes('fn_get_profit_loss')) {
    fail('RP-INV-1', 'ERP profit-loss route must call fn_get_profit_loss');
  }
}

const legacy = path.join(ROOT, 'SamplePOS.Server/src/services/profitLossReportService.ts');
if (existsSync(legacy)) {
  const text = readFileSync(legacy, 'utf8');
  if (text.includes('gl_period_balances')) {
    fail('RP-INV-4', 'profitLossReportService must not query gl_period_balances (Phase 5B migrated)');
  }
  if (!text.includes('fn_get_profit_loss') || !text.includes('fn_get_profit_loss_summary')) {
    fail('RP-INV-1', 'profitLossReportService.getProfitLossReport must use fn_get_profit_loss*');
  }
}

const regFile = existsSync(registryPath) ? readFileSync(registryPath, 'utf8') : '';
if (regFile.includes("id: 'RP04'")) {
  if (regFile.includes("class: 'LEGACY'") && !regFile.includes("status: 'MIGRATED'")) {
    fail('RP-INV-4', 'RP04 still LEGACY — migrate getProfitLossReport to fn_get_profit_loss*');
  }
  if (!regFile.includes("status: 'MIGRATED'")) {
    fail('RP-INV-4', 'RP04 must be MIGRATED after Phase 5B');
  }
}

const tax = path.join(
  ROOT,
  'SamplePOS.Server/src/modules/reports/taxComplianceReportController.ts',
);
if (existsSync(tax)) {
  const text = readFileSync(tax, 'utf8');
  if (!/whtReportService/.test(text)) {
    fail('RP-INV-5', 'tax compliance controller must delegate to whtReportService');
  }
}

const checklist = path.join(ROOT, 'samplepos.client/src/lib/financialCloseChecklist.ts');
if (existsSync(checklist)) {
  const text = readFileSync(checklist, 'utf8');
  for (const step of ['step-quarantine-aging', 'step-vat-remittance', 'step-bad-debt-writeoff']) {
    if (!text.includes(step)) fail('RP-INV-6', `checklist missing ${step}`);
  }
  for (const p of ['/inventory/quarantine', '/accounting/vat-remittance', '/accounting/bad-debt']) {
    if (!text.includes(p)) fail('RP-INV-6', `checklist missing path ${p}`);
  }
}

const launcher = path.join(
  ROOT,
  'samplepos.client/src/components/financial-workspace/ReportsLauncher.tsx',
);
if (!existsSync(launcher)) {
  fail('C-5C', 'ReportsLauncher.tsx missing');
} else {
  const text = readFileSync(launcher, 'utf8');
  for (const p of [
    '/accounting/profit-loss',
    '/reports/tax-compliance',
    '/accounting/vat-remittance',
    '/accounting/bad-debt',
    '/inventory/quarantine',
  ]) {
    if (!text.includes(p)) fail('C-5C', `ReportsLauncher missing close-package link ${p}`);
  }
  if (!text.includes("kind: 'financial'") || !text.includes("kind: 'operational'")) {
    fail('C-5C', 'ReportsLauncher must separate financial vs operational report kinds');
  }
}

if (existsSync(registryPath)) {
  const reg = readFileSync(registryPath, 'utf8');
  if (reg.includes("id: 'RP09'") && !reg.includes("status: 'MIGRATED'")) {
    // Ensure RP09 block is migrated — look for RP09 nearby MIGRATED is fragile; check DEFERRED gone for RP09
    const rp09 = reg.slice(reg.indexOf("id: 'RP09'"), reg.indexOf("id: 'RP09'") + 400);
    if (rp09.includes("status: 'DEFERRED'")) {
      fail('C-5C', 'RP09 ReportsLauncher still DEFERRED');
    }
  }
}

const invShared = path.join(ROOT, 'shared/reporting/reportingInvariants.ts');
if (existsSync(invShared)) {
  const text = readFileSync(invShared, 'utf8');
  if (!text.includes('assertDomainExpenseHitsPnl') || !text.includes('assertBadDebtNotSalesReturns')) {
    fail('RP-INV-8', 'shared reporting missing domain expense honesty asserts');
  }
}

const honestyProof = path.join(
  ROOT,
  'SamplePOS.Server/src/modules/reporting/reportingCrossDomainHonestyProof.test.ts',
);
if (!existsSync(honestyProof)) {
  fail('C-5D', 'reportingCrossDomainHonestyProof.test.ts missing');
} else {
  const text = readFileSync(honestyProof, 'utf8');
  for (const marker of ['RP-INV-7', 'RP-INV-8', 'RP-INV-9', 'RP-INV-5']) {
    if (!text.includes(marker)) fail('C-5D', `honesty proof missing ${marker}`);
  }
}

if (STRICT) {
  const deferred = (readFileSync(registryPath, 'utf8').match(/status:\s*'DEFERRED'/g) ?? [])
    .length;
  if (deferred > 2) {
    warn('A-03', `${deferred} DEFERRED touchpoints — expected shrink by 5E`);
  }
}

console.log('═'.repeat(60));
console.log(' ci:reporting-fitness');
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

console.log(`\n✓ Reporting fitness PASS (${warnings.length} warning(s))`);
process.exit(0);
