#!/usr/bin/env node
/**
 * Proof matrix — quotation customer UX + tenant schema integrity.
 * ALL sections must PASS before commit/deploy (no manual sign-off substitute).
 *
 * Usage:
 *   node scripts/proof-quotation-customer-schema-matrix.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = join(root, 'SamplePOS.Server');
const clientDir = join(root, 'samplepos.client');

let fail = 0;

function section(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}`);
  if (detail) console.log(`   ${detail}`);
  if (!ok) fail += 1;
}

function run(cmd, args, cwd = root) {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return {
    ok: r.status === 0,
    out: `${r.stdout || ''}${r.stderr || ''}`,
    code: r.status ?? 1,
  };
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  QUOTATION + CUSTOMER SCHEMA PROOF MATRIX                   ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// ── 1. Source invariants (no deploy drift) ─────────────────────────────────
console.log('1. SOURCE INVARIANTS\n');

const customerSelector = read('samplepos.client/src/components/pos/CustomerSelector.tsx');
section(
  'CustomerSelector Quick Add is type="button" (no accidental form submit)',
  /type="button"[\s\S]*setShowQuickAdd\(true\)/.test(customerSelector),
  'Prevents quotation form submit when adding customer'
);
section(
  'CustomerSelector dropdown rows are type="button"',
  (customerSelector.match(/type="button"/g) || []).length >= 3,
  `found ${(customerSelector.match(/type="button"/g) || []).length} type="button"`
);

const newQuote = read('samplepos.client/src/pages/quotations/NewQuotationPage.tsx');
section('NewQuotationPage uses shared quotationCalculations', newQuote.includes('quotationCalculations'));
section('NewQuotationPage UoM column', newQuote.includes('uomName') && newQuote.includes('>UoM<'));
section('NewQuotationPage conditional tax (showTax)', newQuote.includes('showTax'));
section('NewQuotationPage quantity arrow handler', newQuote.includes('handleQuantityKeyDown'));
section('NewQuotationPage uses QuotationLineUomSelect (system UoM)', newQuote.includes('QuotationLineUomSelect'));
section('NewQuotationPage no free-text UoM input', !newQuote.includes("updateItem(index, 'uomName', e.target.value)"));

const editQuote = read('samplepos.client/src/pages/quotations/EditQuotationPage.tsx');
section('EditQuotationPage UoM column', editQuote.includes('>UoM<'));
section('EditQuotationPage conditional tax', editQuote.includes('showTax'));

const detailQuote = read('samplepos.client/src/pages/quotations/QuoteDetailPage.tsx');
section('QuoteDetailPage UoM on print/detail', detailQuote.includes('item.uomName'));
section('QuoteDetailPage conditional tax on print', detailQuote.includes('showTax'));

section('tenantSchemaIntegrity module exists', existsSync(join(serverDir, 'src/modules/system/tenantSchemaIntegrity.ts')));
const migrationSvc = read('SamplePOS.Server/src/modules/system/tenantMigrationService.ts');
section(
  'prepareNewTenantDatabase calls assertTenantSchemaIntegrity',
  migrationSvc.includes('assertTenantSchemaIntegrity')
);
section(
  'audit-tenant-schema-drift.mjs exists',
  existsSync(join(root, 'scripts/audit-tenant-schema-drift.mjs'))
);

// ── 2. Client unit tests ───────────────────────────────────────────────────
console.log('\n2. CLIENT UNIT TESTS\n');
const clientTests = run('npx', ['vitest', 'run', 'src/__tests__/quotation-calculations.spec.ts'], clientDir);
section(
  'quotation-calculations.spec.ts',
  clientTests.ok,
  clientTests.ok ? 'vitest PASS' : clientTests.out.split('\n').slice(-5).join(' | ')
);

// ── 3. Server unit tests ───────────────────────────────────────────────────
console.log('\n3. SERVER UNIT TESTS\n');
const serverTests = run(
  'npm',
  ['test', '--', 'src/modules/system/tenantSchemaIntegrity.test.ts', '--runInBand'],
  serverDir
);
section(
  'tenantSchemaIntegrity.test.ts',
  serverTests.ok && serverTests.out.includes('tenantSchemaIntegrity'),
  serverTests.ok ? 'jest PASS' : serverTests.out.split('\n').slice(-8).join(' | ')
);

// ── 4. Build ───────────────────────────────────────────────────────────────
console.log('\n4. BUILD\n');
const build = run('npm', ['run', 'build'], serverDir);
section('Server tsc build', build.ok, build.ok ? 'PASS' : 'FAIL');

// ── 5. Schema drift script (local repo files only) ─────────────────────────
console.log('\n5. AUDIT SCRIPT\n');
const auditScript = read('scripts/audit-tenant-schema-drift.mjs');
section(
  'audit script checks customers.customer_group_id table list',
  auditScript.includes('customers') && auditScript.includes('quotation_items'),
  'Covers customers, products, quotations, pricing tables'
);

const integritySrc = read('SamplePOS.Server/src/modules/system/tenantSchemaIntegrity.ts');
const criticalTables = [...integritySrc.matchAll(/^\s{2}(\w+):\s*\[/gm)].map((m) => m[1]);
const auditTables = (auditScript.match(/TABLES \|\|[\s\S]*?'([^']+)'/)?.[1] || '').split(',');
const auditTableSet = new Set(auditTables.map((t) => t.trim()).filter(Boolean));
const missingFromAudit = criticalTables.filter((t) => !auditTableSet.has(t));
section(
  'CRITICAL_SCHEMA_COLUMNS tables covered by audit script',
  missingFromAudit.length === 0,
  missingFromAudit.length ? `missing: ${missingFromAudit.join(', ')}` : `${criticalTables.length} tables aligned`
);

console.log('\n' + '═'.repeat(64));
if (fail === 0) {
  console.log('✅ QUOTATION + CUSTOMER SCHEMA PROOF MATRIX — ALL PASS');
  console.log('   Run proof:quotation-customer-schema:live for Bliss/Henber API + DB checks.');
} else {
  console.log(`❌ ${fail} section(s) FAILED — do not commit until fixed.`);
}
console.log('═'.repeat(64));
process.exit(fail > 0 ? 1 : 0);
