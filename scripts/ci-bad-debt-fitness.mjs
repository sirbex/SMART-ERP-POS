#!/usr/bin/env node
/**
 * Architecture fitness — Bad Debt domain (Gate A / Phase 4A).
 *
 * Usage:
 *   npm run ci:bad-debt-fitness
 *   npm run ci:bad-debt-fitness -- --strict
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STRICT = process.env.BAD_DEBT_CERT_STRICT === '1' || process.argv.includes('--strict');

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
  'SamplePOS.Server/src/modules/bad-debt/badDebtTouchpointRegistry.ts',
);
if (!existsSync(registryPath)) {
  fail('A-02', 'badDebtTouchpointRegistry.ts missing');
} else {
  const src = readFileSync(registryPath, 'utf8');
  const notStarted = (src.match(/status:\s*'NOT_STARTED'/g) ?? []).length;
  if (notStarted > 0) fail('A-03', `${notStarted} touchpoint(s) still NOT_STARTED`);
  if (!(src.match(/status:\s*'/g) ?? []).length) fail('A-02', 'Registry empty');
  for (const id of ['BD03', 'BD06', 'BD08', 'BD10', 'BD11', 'BD12', 'BD13', 'BD14', 'BD15', 'BD16']) {
    if (!src.includes(`id: '${id}'`)) fail('A-02', `Missing touchpoint ${id}`);
  }
}

const required = [
  'shared/sql/550_bad_debt_foundation.sql',
  'shared/bad-debt/index.ts',
  'shared/bad-debt/badDebtTypes.ts',
  'shared/bad-debt/badDebtInvariants.ts',
  'SamplePOS.Server/src/modules/bad-debt/badDebtSettings.ts',
  'SamplePOS.Server/src/modules/bad-debt/badDebtService.ts',
  'SamplePOS.Server/src/modules/bad-debt/badDebtRoutes.ts',
  'shared/sql/551_bad_debt_writeoff_documents.sql',
  'docs/architecture/BAD_DEBT_ADR.md',
  'docs/architecture/BAD_DEBT_INVARIANTS.md',
  'docs/architecture/BAD_DEBT_PHASE4_ROADMAP.md',
  'PROOF_BAD_DEBT_CHARTER.md',
];
for (const r of required) {
  if (!existsSync(path.join(ROOT, r))) fail('A-01', `Missing ${r}`);
}

const adr = path.join(ROOT, 'docs/architecture/BAD_DEBT_ADR.md');
if (existsSync(adr)) {
  const text = readFileSync(adr, 'utf8');
  if (!/\*\*Status:\*\* Accepted/i.test(text)) {
    fail('A-01', 'ADR-006 not Accepted');
  }
  if (!text.includes('Freeze AR uncollectible recognition')) {
    fail('A-01', 'ADR-006 missing freeze statement');
  }
}

const gov = path.join(ROOT, 'SamplePOS.Server/src/services/postingGovernanceService.ts');
if (existsSync(gov)) {
  const text = readFileSync(gov, 'utf8');
  if (!text.includes("'AR_WRITEOFF'") || !text.includes("'AR_WRITEOFF_REVERSAL'")) {
    fail('A-06', 'postingGovernanceService missing AR_WRITEOFF sources');
  }
}

const schema = path.join(ROOT, 'SamplePOS.Server/src/constants/schemaVersion.ts');
if (existsSync(schema)) {
  const text = readFileSync(schema, 'utf8');
  if (!/CURRENT_SCHEMA_VERSION\s*=\s*(550|551|552|553|554|555)\b/.test(text)) {
    fail('A-05', 'CURRENT_SCHEMA_VERSION must be >= 550 for Phase 4A (current = 555)');
  }
}

const mig550 = path.join(ROOT, 'shared/sql/550_bad_debt_foundation.sql');
if (existsSync(mig550)) {
  const text = readFileSync(mig550, 'utf8');
  if (!text.includes('bad_debt_writeoff_enabled') || !text.includes("'5210'")) {
    fail('A-05', '550 migration must set flag and seed 5210');
  }
  if (!text.includes('AR_WRITEOFF')) {
    fail('A-06', '550 migration must add AR_WRITEOFF AllowedSources');
  }
}

const mig551 = path.join(ROOT, 'shared/sql/551_bad_debt_writeoff_documents.sql');
if (!existsSync(mig551)) {
  fail('C-4B', '551_bad_debt_writeoff_documents.sql missing');
} else {
  const text = readFileSync(mig551, 'utf8');
  if (!text.includes('ar_writeoff_documents') || !text.includes('ar_writeoff_lines')) {
    fail('C-4B', '551 migration incomplete');
  }
}

const writeoffSvc = path.join(
  ROOT,
  'SamplePOS.Server/src/modules/bad-debt/badDebtService.ts',
);
if (!existsSync(writeoffSvc)) {
  fail('C-4B', 'badDebtService missing');
} else {
  const text = readFileSync(writeoffSvc, 'utf8');
  if (!text.includes('createAndPostWriteoff') || !text.includes('reverseWriteoff')) {
    fail('C-4B', 'write-off create/post/reverse incomplete');
  }
  if (!text.includes("source: 'AR_WRITEOFF'")) {
    fail('C-4B', 'posting source AR_WRITEOFF required');
  }
  if (!text.includes('getWriteoffWorkqueue') || !text.includes('listRecentWriteoffs')) {
    fail('C-4C', 'workqueue / documents list missing from badDebtService');
  }
}

const uiPage = path.join(
  ROOT,
  'samplepos.client/src/pages/accounting/BadDebtWriteoffPage.tsx',
);
if (!existsSync(uiPage)) {
  fail('C-4C', 'BadDebtWriteoffPage.tsx missing');
} else {
  const text = readFileSync(uiPage, 'utf8');
  if (!/credit-debit-notes/.test(text) || !/write-?off/i.test(text)) {
    fail('C-4C', 'UI must contrast credit notes vs write-off');
  }
  if (!/usePostBadDebtWriteoff/.test(text) || !/useReverseBadDebtWriteoff/.test(text)) {
    fail('C-4C', 'UI must wire post + reverse mutations');
  }
}

const appRoutes = path.join(ROOT, 'samplepos.client/src/App.tsx');
if (existsSync(appRoutes)) {
  const text = readFileSync(appRoutes, 'utf8');
  if (!text.includes('/accounting/bad-debt') || !text.includes('BadDebtWriteoffPage')) {
    fail('C-4C', 'App route /accounting/bad-debt missing');
  }
}

const apiClient = path.join(ROOT, 'samplepos.client/src/utils/api.ts');
if (existsSync(apiClient)) {
  const text = readFileSync(apiClient, 'utf8');
  if (!text.includes('badDebt:') || !text.includes('bad-debt/workqueue')) {
    fail('C-4C', 'api.badDebt client missing');
  }
}

const routes = path.join(ROOT, 'SamplePOS.Server/src/modules/bad-debt/badDebtRoutes.ts');
if (existsSync(routes)) {
  const text = readFileSync(routes, 'utf8');
  if (!text.includes("'/workqueue'") || !text.includes("'/documents'")) {
    fail('C-4C', 'routes must expose workqueue + documents');
  }
  if (
    !text.includes("requirePermission('accounting.manage')") ||
    !text.includes("requirePermission('accounting.read')")
  ) {
    fail('C-4C', 'mutating routes need accounting.manage; reads need accounting.read');
  }
}

const settlement = path.join(
  ROOT,
  'SamplePOS.Server/src/modules/invoices/invoiceRepository.ts',
);
if (existsSync(settlement)) {
  const text = readFileSync(settlement, 'utf8');
  if (!text.includes('ar_writeoff_lines') || !text.includes('writeoff_amount')) {
    fail('BD-INV-3', 'getInvoiceSettlement must include posted write-offs');
  }
}

const gl = path.join(ROOT, 'SamplePOS.Server/src/services/glEntryService.ts');
if (existsSync(gl)) {
  const text = readFileSync(gl, 'utf8');
  if (!text.includes("BAD_DEBT_EXPENSE: '5210'")) {
    fail('A-05', 'AccountCodes.BAD_DEBT_EXPENSE must be 5210');
  }
}

const cn = path.join(
  ROOT,
  'SamplePOS.Server/src/modules/credit-debit-notes/creditDebitNoteService.ts',
);
if (existsSync(cn)) {
  const text = readFileSync(cn, 'utf8');
  if (/AR_WRITEOFF|createAndPostArWriteoff|badDebtService/.test(text)) {
    fail('BD-INV-4', 'creditDebitNoteService must not create AR_WRITEOFF documents');
  }
  if (!text.includes('assertCreditNoteReasonNotBadDebt')) {
    fail('BD-INV-4', 'creditDebitNoteService must reject uncollectible CN reasons');
  }
}

const loss = path.join(
  ROOT,
  'SamplePOS.Server/src/modules/loss-quarantine/lossDisposalService.ts',
);
if (existsSync(loss)) {
  const text = readFileSync(loss, 'utf8');
  if (text.includes("'1200'") || text.includes('AR_WRITEOFF')) {
    fail('BD-INV-5', 'lossDisposalService must not clear AR 1200 or post AR_WRITEOFF');
  }
}

const orphanScan = path.join(ROOT, 'SamplePOS.Server/src/modules/bad-debt/badDebtOrphanScan.ts');
if (!existsSync(orphanScan)) {
  fail('BD-INV-6', 'badDebtOrphanScan.ts missing');
} else {
  const text = readFileSync(orphanScan, 'utf8');
  if (!text.includes('scanOrphanArExpenseWriteoffs') || !text.includes('AR_EXPENSE_CR_ALLOWLIST')) {
    fail('BD-INV-6', 'orphan scan incomplete');
  }
}

const repair = path.join(ROOT, 'SamplePOS.Server/src/modules/system/glRepairService.ts');
if (existsSync(repair)) {
  const text = readFileSync(repair, 'utf8');
  if (/createAndPostWriteoff|source:\s*'AR_WRITEOFF'/.test(text)) {
    fail('BD-INV-6', 'glRepairService must never invent AR_WRITEOFF');
  }
}

const checklist = path.join(ROOT, 'samplepos.client/src/lib/financialCloseChecklist.ts');
if (!existsSync(checklist)) {
  fail('C-4D', 'financialCloseChecklist.ts missing');
} else {
  const text = readFileSync(checklist, 'utf8');
  if (!text.includes('step-bad-debt-writeoff') || !text.includes('/accounting/bad-debt')) {
    fail('C-4D', 'period-close step-bad-debt-writeoff missing');
  }
  if (!/blocksClose:\s*false/.test(text)) {
    fail('C-4D', 'bad-debt close step must remain non-blocking');
  }
}

const arProvider = path.join(
  ROOT,
  'SamplePOS.Server/src/modules/financial-reconciliation/providers/arReconciliationProvider.ts',
);
if (existsSync(arProvider)) {
  const text = readFileSync(arProvider, 'utf8');
  if (!text.includes('computeWriteoff') || !text.includes("'writeoff'")) {
    fail('C-4D', 'AR writeoff exposure lane missing');
  }
}

if (STRICT) {
  const deferred = (readFileSync(registryPath, 'utf8').match(/status:\s*'DEFERRED'/g) ?? [])
    .length;
  if (deferred > 2) {
    warn('A-03', `${deferred} DEFERRED touchpoints — expected shrink by 4E`);
  }
}

console.log('═'.repeat(60));
console.log(' ci:bad-debt-fitness');
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

console.log(`\n✓ Bad Debt fitness PASS (${warnings.length} warning(s))`);
process.exit(0);
