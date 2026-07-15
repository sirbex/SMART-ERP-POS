/**
 * Architecture fitness — VAT Remittance domain (Gate A / Phase 3A–3D).
 *
 * Usage:
 *   npm run ci:vat-remittance-fitness
 *   npm run ci:vat-remittance-fitness -- --strict
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STRICT = process.env.VAT_REMITTANCE_CERT_STRICT === '1' || process.argv.includes('--strict');

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
  'SamplePOS.Server/src/modules/vat-remittance/vatRemittanceTouchpointRegistry.ts',
);
if (!existsSync(registryPath)) {
  fail('A-02', 'vatRemittanceTouchpointRegistry.ts missing');
} else {
  const src = readFileSync(registryPath, 'utf8');
  const notStarted = (src.match(/status:\s*'NOT_STARTED'/g) ?? []).length;
  if (notStarted > 0) fail('A-03', `${notStarted} touchpoint(s) still NOT_STARTED`);
  if (!(src.match(/status:\s*'/g) ?? []).length) fail('A-02', 'Registry empty');
  if (!src.includes("id: 'VR13'") || !src.includes('step-vat-remittance')) {
    fail('E-05', 'VR13 period-close checklist touchpoint missing');
  }
  if (!src.includes('VR-INV-10') || !src.includes('sumPostedVatRemittances')) {
    fail('B-05', 'VR06 must reference VR-INV-10 settled SSOT');
  }
}

const required = [
  'shared/sql/548_vat_remittance_foundation.sql',
  'shared/sql/549_vat_tax_receivable_vr_inv_6.sql',
  'shared/vat-remittance/index.ts',
  'SamplePOS.Server/src/modules/vat-remittance/vatRemittanceSettings.ts',
  'SamplePOS.Server/src/modules/vat-remittance/vatAccrualReconService.ts',
  'SamplePOS.Server/src/modules/vat-remittance/vatRemittanceSettled.ts',
  'docs/architecture/VAT_REMITTANCE_ADR.md',
  'PROOF_VAT_REMITTANCE_CHARTER.md',
];
for (const r of required) {
  if (!existsSync(path.join(ROOT, r))) fail('A-01', `Missing ${r}`);
}

const adr = path.join(ROOT, 'docs/architecture/VAT_REMITTANCE_ADR.md');
if (existsSync(adr)) {
  const text = readFileSync(adr, 'utf8');
  if (!/\*\*Status:\*\* Accepted/i.test(text)) {
    fail('A-01', 'ADR-005 not Accepted');
  }
  if (!text.includes('Freeze VAT around two distinct economic events')) {
    fail('A-01', 'ADR-005 missing freeze statement');
  }
  if (!text.includes('Decision B')) {
    fail('B-3B', 'ADR-005 missing Phase 3B Decision B appendix');
  }
}

const gov = path.join(ROOT, 'SamplePOS.Server/src/services/postingGovernanceService.ts');
if (existsSync(gov)) {
  const text = readFileSync(gov, 'utf8');
  if (!text.includes("'VAT_REMITTANCE'") || !text.includes("source !== 'VAT_REMITTANCE'")) {
    fail('A-06', 'postingGovernanceService missing VAT_REMITTANCE Rule D allow');
  }
}

const schema = path.join(ROOT, 'SamplePOS.Server/src/constants/schemaVersion.ts');
if (existsSync(schema)) {
  const text = readFileSync(schema, 'utf8');
  if (!/CURRENT_SCHEMA_VERSION\s*=\s*(549|550|551)\b/.test(text)) {
    fail('A-05', 'CURRENT_SCHEMA_VERSION must be >= 549 for Phase 3B (current = 551)');
  }
}

const mig549 = path.join(ROOT, 'shared/sql/549_vat_tax_receivable_vr_inv_6.sql');
if (existsSync(mig549)) {
  const text = readFileSync(mig549, 'utf8');
  if (!text.includes("SET DEFAULT '2300'") || !text.includes("tax_receivable_account = '2300'")) {
    fail('VR-INV-6', '549 migration must set tax_receivable_account default/backfill to 2300');
  }
}

const vatProvider = path.join(
  ROOT,
  'SamplePOS.Server/src/modules/financial-reconciliation/providers/vatReconciliationProvider.ts',
);
if (!existsSync(vatProvider)) {
  fail('B-3B', 'vatReconciliationProvider missing');
} else {
  const text = readFileSync(vatProvider, 'utf8');
  if (!text.includes("domain = 'vat'") || !text.includes('computeIntegrity')) {
    fail('B-3B', 'VAT recon provider incomplete');
  }
}

const remitSvc = path.join(
  ROOT,
  'SamplePOS.Server/src/modules/vat-remittance/vatRemittanceService.ts',
);
if (!existsSync(remitSvc)) {
  fail('C-3C', 'vatRemittanceService missing');
} else {
  const text = readFileSync(remitSvc, 'utf8');
  if (!text.includes('createAndPostVatRemittance') || !text.includes('reverseVatRemittance')) {
    fail('C-3C', 'VAT remittance create/post/reverse incomplete');
  }
}

const postingSrc = path.join(ROOT, 'shared/treasury/treasuryTypes.ts');
if (existsSync(postingSrc)) {
  const text = readFileSync(postingSrc, 'utf8');
  if (!/case 'VAT_REMITTANCE':\s*[\r\n]+\s*return 'VAT_REMITTANCE'/.test(text)) {
    fail('C-3C', 'postingSourceForDocumentType must return VAT_REMITTANCE');
  }
}

const taxEngine = path.join(ROOT, 'SamplePOS.Server/src/services/taxEngine.ts');
if (existsSync(taxEngine)) {
  const text = readFileSync(taxEngine, 'utf8');
  if (text.includes("|| '1400'") || text.includes('|| "1400"')) {
    fail('VR-INV-6', 'taxEngine still falls back to 1400 for tax receivable');
  }
  if (!text.includes("|| '2300'") && !text.includes('|| "2300"')) {
    fail('VR-INV-6', 'taxEngine must fall back to 2300 for tax receivable');
  }
}

// VR-INV-10: liability report uses TD settled SSOT
const liability = path.join(
  ROOT,
  'SamplePOS.Server/src/modules/withholding-tax/whtReportService.ts',
);
if (existsSync(liability)) {
  const text = readFileSync(liability, 'utf8');
  if (!text.includes('sumPostedVatRemittances')) {
    fail('VR-INV-10', 'getTaxLiabilityReport must use sumPostedVatRemittances for VAT settled');
  }
}

// VR-INV-9: no cross-calls between VAT remit gateway and WHT remit
const vatFiles = [
  'SamplePOS.Server/src/modules/vat-remittance/vatRemittanceService.ts',
  'SamplePOS.Server/src/modules/vat-remittance/vatRemittanceRoutes.ts',
];
for (const rel of vatFiles) {
  const p = path.join(ROOT, rel);
  if (!existsSync(p)) continue;
  const text = readFileSync(p, 'utf8');
  if (/\bremitWht\b|\brecoverWht\b|WHT_RECEIVABLE_RECOVERY/.test(text)) {
    fail('VR-INV-9', `${rel} must not call WHT remit/recover`);
  }
}
const whtSvc = path.join(ROOT, 'SamplePOS.Server/src/modules/withholding-tax/whtService.ts');
if (existsSync(whtSvc)) {
  const text = readFileSync(whtSvc, 'utf8');
  if (/createAndPostVatRemittance|documentType:\s*'VAT_REMITTANCE'/.test(text)) {
    fail('VR-INV-9', 'whtService must not create VAT_REMITTANCE documents');
  }
}

const checklist = path.join(ROOT, 'samplepos.client/src/lib/financialCloseChecklist.ts');
if (!existsSync(checklist)) {
  fail('E-05', 'financialCloseChecklist.ts missing');
} else {
  const text = readFileSync(checklist, 'utf8');
  if (!text.includes('step-vat-remittance') || !text.includes('/accounting/vat-remittance')) {
    fail('E-05', 'Period-close checklist missing VAT remittance step');
  }
}

if (STRICT) {
  const deferred = (readFileSync(registryPath, 'utf8').match(/status:\s*'DEFERRED'/g) ?? [])
    .length;
  if (deferred > 2) {
    warn('A-03', `${deferred} DEFERRED touchpoints — expected shrink by 3E`);
  }
}

console.log('═'.repeat(60));
console.log(' ci:vat-remittance-fitness');
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

console.log(`\n✓ VAT Remittance fitness PASS (${warnings.length} warning(s))`);
process.exit(0);
