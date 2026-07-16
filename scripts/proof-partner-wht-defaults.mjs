#!/usr/bin/env node
/**
 * Static + unit proof that partner WHT default gaps are closed.
 * Run: node scripts/proof-partner-wht-defaults.mjs
 * (Also runs vitest for partner-wht-* tests via npx when available.)
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const lines = [];
let fail = 0;

function ok(msg) {
  lines.push(`✓ ${msg}`);
}
function bad(msg) {
  fail += 1;
  lines.push(`✗ ${msg}`);
}
function section(title) {
  lines.push('');
  lines.push(`── ${title} ──`);
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function mustInclude(rel, needles, label) {
  if (!existsSync(join(root, rel))) {
    bad(`${label}: missing file ${rel}`);
    return;
  }
  const src = read(rel);
  for (const n of needles) {
    if (!src.includes(n)) bad(`${label}: ${rel} missing "${n}"`);
  }
  if (needles.every((n) => src.includes(n))) ok(`${label}: ${rel}`);
}

section('1. Schema 553 + version pin');
mustInclude('shared/sql/553_partner_wht_defaults.sql', [
  'wht_liable',
  'default_wht_type_id',
  '"WhtLiable"',
  '"DefaultWhtTypeId"',
  'INSERT INTO schema_version (version) VALUES (553)',
], 'migration');
mustInclude('SamplePOS.Server/src/constants/schemaVersion.ts', [
  'CURRENT_SCHEMA_VERSION = 553',
], 'schema pin');

section('2. Shared resolver + zod');
mustInclude('shared/wht/partnerWhtDefault.ts', [
  'resolvePartnerWhtDefault',
  'whtLiable',
  'defaultWhtTypeId',
], 'resolver');
mustInclude('shared/zod/customer.ts', ['whtLiable', 'defaultWhtTypeId'], 'customer zod');
mustInclude('shared/zod/supplier.ts', ['whtLiable', 'defaultWhtTypeId'], 'supplier zod');

section('3. Backend read/write + assert');
mustInclude('SamplePOS.Server/src/modules/customers/customerRepository.ts', [
  'whtLiable',
  'defaultWhtTypeId',
  'findCustomerById',
  'CUSTOMER_SELECT',
], 'customer repo');
// Regression: detail GET must not use a private SELECT that omits WHT
{
  const repo = read('SamplePOS.Server/src/modules/customers/customerRepository.ts');
  const byId = repo.match(/export async function findCustomerById[\s\S]*?^}/m)?.[0] || '';
  if (byId.includes('CUSTOMER_SELECT') && byId.includes('CUSTOMER_FROM_JOIN')) {
    ok('findCustomerById SSOT = CUSTOMER_SELECT (detail overview fix)');
  } else {
    bad('findCustomerById does not use CUSTOMER_SELECT — overview will show Not liable');
  }
}
mustInclude('SamplePOS.Server/src/modules/suppliers/supplierRepository.ts', [
  'WhtLiable',
  'DefaultWhtTypeId',
], 'supplier repo');
mustInclude('SamplePOS.Server/src/modules/withholding-tax/whtService.ts', [
  'assertPartnerDefaultWhtType',
], 'wht assert');
mustInclude('SamplePOS.Server/src/modules/customers/customerService.ts', [
  'assertPartnerDefaultWhtType',
], 'customer service');
mustInclude('SamplePOS.Server/src/modules/suppliers/supplierService.ts', [
  'assertPartnerDefaultWhtType',
], 'supplier service');

section('4. UI create/edit + list badges (gap closure)');
mustInclude('samplepos.client/src/components/customers/QuickAddCustomerModal.tsx', [
  'Customer withholds tax',
  'whtLiable',
  'defaultWhtTypeId',
], 'customer create');
mustInclude('samplepos.client/src/components/customers/CustomerDetailModal.tsx', [
  'Customer withholds tax',
  'whtLiable',
], 'customer edit modal');
mustInclude('samplepos.client/src/pages/customers/CustomerDetailPage.tsx', [
  'Customer withholds tax',
  'whtLiable',
], 'customer edit page');
mustInclude('samplepos.client/src/pages/SuppliersPage.tsx', [
  'Subject to withholding tax',
  'whtLiable',
  'PartnerWhtLiableBadge',
], 'supplier create/edit + list');
mustInclude('samplepos.client/src/pages/CustomersPage.tsx', [
  'PartnerWhtLiableBadge',
], 'customer list badge');
mustInclude('samplepos.client/src/components/partners/PartnerWhtLiableBadge.tsx', [
  'WHT liable',
], 'shared badge');

section('5. Offline queue + sync payload (gap closure)');
mustInclude('samplepos.client/src/components/customers/QuickAddCustomerModal.tsx', [
  'whtLiable',
  'defaultWhtTypeId',
  'putCustomer({',
  'queueOfflineCustomer(offlineCustomer)',
], 'offline IndexedDB write');
mustInclude('samplepos.client/src/services/offlineSyncEngine.ts', [
  'whtLiable: cust.whtLiable === true',
  'defaultWhtTypeId: cust.whtLiable === true',
], 'offline sync payload');
mustInclude('samplepos.client/src/lib/offlineMappers.ts', [
  'whtLiable:',
  'defaultWhtTypeId:',
], 'offline mapper');

section('6. Payment auto-select');
mustInclude('samplepos.client/src/pages/accounting/CustomerPaymentsPage.tsx', [
  'resolvePartnerWhtDefault',
  'partnerWhtHint',
], 'customer payments');
mustInclude('samplepos.client/src/pages/accounting/SupplierPaymentsPage.tsx', [
  'resolvePartnerWhtDefault',
  'partnerWhtHint',
], 'supplier payments');

section('7. Unit tests');
const vitest = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    'vitest',
    'run',
    'src/__tests__/partner-wht-default.test.ts',
    'src/__tests__/partner-wht-offline.test.ts',
  ],
  {
    cwd: join(root, 'samplepos.client'),
    encoding: 'utf8',
    shell: true,
  },
);
const out = `${vitest.stdout || ''}\n${vitest.stderr || ''}`;
lines.push(out.trim().split('\n').slice(-20).join('\n'));
if (vitest.status === 0) {
  ok('vitest partner-wht-default + partner-wht-offline PASS');
} else {
  bad(`vitest failed (exit ${vitest.status})`);
}

const header = [
  '════════════════════════════════════════════════════════════════════════',
  ' PARTNER WHT DEFAULTS — GAP CLOSURE PROOF (schema 553)',
  ` Generated: ${new Date().toISOString()}`,
  '════════════════════════════════════════════════════════════════════════',
];
const footer = [
  '',
  fail === 0 ? 'RESULT: PASS — all partner WHT gaps closed in code + unit tests' : `RESULT: FAIL — ${fail} check(s) failed`,
  '',
];

const report = [...header, ...lines, ...footer].join('\n');
const outPath = join(root, 'PROOF_PARTNER_WHT_DEFAULTS.md');
writeFileSync(outPath, report + '\n', 'utf8');
console.log(report);
console.log(`\nWrote ${outPath}`);
process.exit(fail === 0 ? 0 : 1);
