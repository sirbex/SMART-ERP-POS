#!/usr/bin/env node
/**
 * Architecture fitness — Treasury Document domain (Gate A / A-05).
 *
 * Fails CI when:
 *   - Touchpoints remain NOT_STARTED
 *   - New production code posts MANUAL_JOURNAL while referencing liquidity tags/codes
 *     outside allow-listed journal paths (heuristic)
 *
 * Usage:
 *   npm run ci:treasury-fitness
 *   npm run ci:treasury-fitness -- --strict
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_SRC = path.join(ROOT, 'SamplePOS.Server/src');
const STRICT = process.env.TREASURY_CERTIFICATION_STRICT === '1' || process.argv.includes('--strict');

const errors = [];
const warnings = [];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage']);

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function fail(code, message) {
  errors.push(`[${code}] ${message}`);
}

function warn(code, message) {
  warnings.push(`[${code}] ${message}`);
}

const registryPath = path.join(
  SERVER_SRC,
  'modules/treasury/treasuryTouchpointRegistry.ts',
);
if (!existsSync(registryPath)) {
  fail('A-02', 'treasuryTouchpointRegistry.ts missing');
} else {
  const registrySrc = readFileSync(registryPath, 'utf8');
  const notStarted = (registrySrc.match(/status:\s*'NOT_STARTED'/g) ?? []).length;
  if (notStarted > 0) {
    fail('A-03', `${notStarted} touchpoint(s) still NOT_STARTED`);
  }
  const statuses = ['MIGRATED', 'SHIMMED', 'ALLOW_LISTED', 'DEFERRED'];
  let statusRows = 0;
  for (const s of statuses) {
    statusRows += (registrySrc.match(new RegExp(`status:\\s*'${s}'`, 'g')) ?? []).length;
  }
  if (statusRows < 10) {
    fail('A-02', `Touchpoint registry too thin (${statusRows} status rows)`);
  }
}

/** Paths allowed to mention MANUAL_JOURNAL + liquidity in the same file (governance / core). */
const MANUAL_LIQUIDITY_ALLOWLIST = new Set([
  'SamplePOS.Server/src/services/postingGovernanceService.ts',
  'SamplePOS.Server/src/services/accountingCore.ts',
  'SamplePOS.Server/src/services/journalEntryService.ts',
  'SamplePOS.Server/src/services/glEntryService.ts',
  'SamplePOS.Server/src/modules/accounting-governance/cashJournalGovernance.ts',
]);

const LIQUIDITY_HINT =
  /systemAccountTag:\s*['"](?:CASH|BANK|UNDEPOSITED|PETTY_CASH|CARD_CLEARING|MOBILE_MONEY)/i;
const MANUAL_SOURCE = /source:\s*['"]MANUAL_JOURNAL['"]/;
const LIQUIDITY_CODES = /['"](?:1010|1012|1015|1020|1030|1040)['"]/;

const tsProduction = walk(SERVER_SRC).filter((f) => f.endsWith('.ts') && !/\.test\.ts$/.test(f));

for (const f of tsProduction) {
  const r = rel(f);
  if (MANUAL_LIQUIDITY_ALLOWLIST.has(r)) continue;
  if (r.includes('modules/treasury/')) continue;
  const text = readFileSync(f, 'utf8');
  if (!MANUAL_SOURCE.test(text)) continue;
  if (!LIQUIDITY_HINT.test(text) && !LIQUIDITY_CODES.test(text)) continue;
  const msg = `Possible MANUAL_JOURNAL + liquidity writer outside allow-list at ${r}`;
  if (STRICT) fail('A-04', msg);
  else warn('A-04', msg);
}

// Gateway presence
const gatewayFiles = [
  'SamplePOS.Server/src/modules/treasury/treasuryService.ts',
  'SamplePOS.Server/src/modules/treasury/depositWorksheetService.ts',
  'SamplePOS.Server/src/modules/treasury/treasuryTransferService.ts',
  'SamplePOS.Server/src/modules/treasury/pettyCashService.ts',
];
for (const g of gatewayFiles) {
  if (!existsSync(path.join(ROOT, g))) fail('A-06', `Missing gateway ${g}`);
}

/** Admin must enable Treasury via Settings → Tax UI (not API/SQL-only copy). */
const settingsTab = path.join(
  ROOT,
  'samplepos.client/src/pages/settings/tabs/SystemSettingsTab.tsx',
);
if (!existsSync(settingsTab)) {
  fail('A-07', 'SystemSettingsTab.tsx missing');
} else {
  const tabSrc = readFileSync(settingsTab, 'utf8');
  if (!tabSrc.includes('id="treasuryDocumentEnabled"')) {
    fail('A-07', 'Settings → Tax missing Enable Treasury Documents checkbox');
  }
  if (!tabSrc.includes('Enable Treasury Documents')) {
    fail('A-07', 'Settings → Tax missing operator label for treasury enable');
  }
  if (!/treasuryDocumentEnabled:\s*settings\.treasuryDocumentEnabled/.test(tabSrc)) {
    fail('A-07', 'TaxSettings form does not load treasuryDocumentEnabled from settings');
  }
}

const treasuryPage = path.join(
  ROOT,
  'samplepos.client/src/pages/accounting/TreasuryDocumentsPage.tsx',
);
if (!existsSync(treasuryPage)) {
  fail('A-07', 'TreasuryDocumentsPage.tsx missing');
} else {
  const pageSrc = readFileSync(treasuryPage, 'utf8');
  if (!pageSrc.includes('Settings → Tax → Enable Treasury Documents') &&
      !readFileSync(path.join(ROOT, 'samplepos.client/src/components/treasury/TreasuryFeatureDisabledNotice.tsx'), 'utf8').includes(
        'Settings → Tax → Enable Treasury Documents',
      )) {
    fail('A-07', 'Treasury disabled UI must direct admins to Settings → Tax toggle');
  }
  if (pageSrc.includes('treasury_document_enabled')) {
    fail('A-07', 'Treasury page must not expose raw DB column name to operators');
  }
}

/** Liquidity UX must live under Banking (no duplicate Advanced Accounting nav items). */
const accountingLayout = path.join(ROOT, 'samplepos.client/src/components/AccountingLayout.tsx');
if (existsSync(accountingLayout)) {
  const layoutSrc = readFileSync(accountingLayout, 'utf8');
  for (const banned of [
    "path: '/accounting/deposit-worksheet'",
    "path: '/accounting/treasury-transfer'",
    "path: '/accounting/petty-cash'",
    "path: '/accounting/treasury'",
  ]) {
    if (layoutSrc.includes(banned)) {
      fail('A-08', `Duplicate treasury nav still present: ${banned}`);
    }
  }
  if (!layoutSrc.includes("path: '/accounting/banking'")) {
    fail('A-08', 'Banking nav missing');
  }
}

const bankingPage = path.join(ROOT, 'samplepos.client/src/pages/accounting/BankingPage.tsx');
if (!existsSync(bankingPage)) {
  fail('A-08', 'BankingPage.tsx missing');
} else {
  const bankSrc = readFileSync(bankingPage, 'utf8');
  for (const tab of ['undeposited', 'move-money', 'petty-cash', 'documents']) {
    if (!bankSrc.includes(`value="${tab}"`)) {
      fail('A-08', `Banking missing merged tab ${tab}`);
    }
  }
  if (!bankSrc.includes('embedded')) {
    fail('A-08', 'Banking must embed treasury pages (avoid duplicate chrome)');
  }
}

const settingsRepo = path.join(
  ROOT,
  'SamplePOS.Server/src/modules/system-settings/systemSettingsRepository.ts',
);
if (existsSync(settingsRepo)) {
  const repoSrc = readFileSync(settingsRepo, 'utf8');
  if (!repoSrc.includes('treasury_document_enabled = $')) {
    fail('A-07', 'systemSettingsRepository must persist treasury_document_enabled');
  }
}

console.log('═'.repeat(60));
console.log(' ci:treasury-fitness');
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

console.log(`\n✓ Treasury fitness PASS (${warnings.length} warning(s))`);
process.exit(0);
