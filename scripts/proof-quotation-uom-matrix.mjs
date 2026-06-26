#!/usr/bin/env node
/**
 * Proof matrix — quotation line UoM (system list, no duplicate free-text).
 *
 * Usage:
 *   node scripts/proof-quotation-uom-matrix.mjs
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
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}` };
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  QUOTATION UoM PROOF MATRIX                                  ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('1. SOURCE INVARIANTS\n');

section('QuotationLineUomSelect component exists', existsSync(join(clientDir, 'src/components/quotations/QuotationLineUomSelect.tsx')));
section('useMasterUoms hook exists', existsSync(join(clientDir, 'src/hooks/useMasterUoms.ts')));
section('quotationStockProduct utility exists', existsSync(join(clientDir, 'src/utils/quotationStockProduct.ts')));
section('quotationUomResolver server module exists', existsSync(join(serverDir, 'src/modules/quotations/quotationUomResolver.ts')));

const stockProduct = read('samplepos.client/src/utils/quotationStockProduct.ts');
section('normalizeStockLevelUoms reads uoms[]', stockProduct.includes('item.uoms') && stockProduct.includes('buildQuoteLineFromStockProduct'));
section('applySellingUomToQuoteLine updates price', stockProduct.includes('applySellingUomToQuoteLine'));

const uomSelect = read('samplepos.client/src/components/quotations/QuotationLineUomSelect.tsx');
section('Custom lines use master UoM select (not free text)', uomSelect.includes('useMasterUoms') && uomSelect.includes('<select'));
section('Product lines use catalog availableUoms (POS parity)', uomSelect.includes('availableUoms') && uomSelect.includes('conversionFactor'));
section('Product lines fallback to UomSelector', uomSelect.includes('UomSelector') && uomSelect.includes('productId'));

const newQuote = read('samplepos.client/src/pages/quotations/NewQuotationPage.tsx');
section('NewQuotationPage uses buildQuoteLineFromStockProduct', newQuote.includes('buildQuoteLineFromStockProduct'));
section('NewQuotationPage uses QuotationLineUomSelect', newQuote.includes('QuotationLineUomSelect'));
section('NewQuotationPage custom line itemType', newQuote.includes("itemType: 'custom'"));
section('NewQuotationPage validates custom uomId', newQuote.includes('customMissingUom'));
section('NewQuotationPage no free-text uom input', !newQuote.includes("updateItem(index, 'uomName', e.target.value)"));

const editQuote = read('samplepos.client/src/pages/quotations/EditQuotationPage.tsx');
section('EditQuotationPage uses buildQuoteLineFromStockProduct', editQuote.includes('buildQuoteLineFromStockProduct'));
section('EditQuotationPage attaches availableUoms on load', editQuote.includes('normalizeStockLevelUoms'));
section('EditQuotationPage uses QuotationLineUomSelect', editQuote.includes('QuotationLineUomSelect'));
section('EditQuotationPage validates custom uomId', editQuote.includes("itemType === 'custom' && !item.uomId"));

const quoteBody = read('SamplePOS.Server/src/modules/documents/bodies/quotationBody.ts');
section('Quotation PDF has separate UoM column', quoteBody.includes("header: 'UoM'") && quoteBody.includes("key: 'uomName'"));

const svc = read('SamplePOS.Server/src/modules/quotations/quotationService.ts');
section('createQuotation normalizes UoM via resolver', svc.includes('normalizeQuotationLineUom') && svc.includes('loadMasterUoms'));
section('updateQuotation normalizes UoM via resolver', (svc.match(/normalizeQuotationLineUom/g) || []).length >= 2);

console.log('\n2. CLIENT UNIT TESTS\n');
const stockProductTests = run('npx', ['vitest', 'run', 'src/utils/quotationStockProduct.test.ts'], clientDir);
section('quotationStockProduct.test.ts', stockProductTests.ok, stockProductTests.ok ? 'vitest PASS' : stockProductTests.out.split('\n').slice(-5).join(' | '));

const clientTests = run('npx', ['vitest', 'run', 'src/__tests__/quotation-uom.spec.ts'], clientDir);
section('quotation-uom.spec.ts', clientTests.ok, clientTests.ok ? 'vitest PASS' : clientTests.out.split('\n').slice(-5).join(' | '));

console.log('\n3. SERVER UNIT TESTS\n');
const serverTests = run(
  'npm',
  ['test', '--', 'src/modules/quotations/quotationUomResolver.test.ts', '--runInBand'],
  serverDir
);
section('quotationUomResolver.test.ts', serverTests.ok && serverTests.out.includes('quotationUomResolver'), serverTests.ok ? 'jest PASS' : serverTests.out.split('\n').slice(-8).join(' | '));

console.log('\n4. BUILD\n');
const build = run('npm', ['run', 'build'], serverDir);
section('Server tsc build', build.ok, build.ok ? 'PASS' : 'FAIL');

console.log('\n' + '═'.repeat(64));
if (fail === 0) {
  console.log('✅ QUOTATION UoM PROOF MATRIX — ALL PASS');
  console.log('   Run proof:quotation-uom:live for Bliss API custom-line UoM checks.');
  console.log('   Run proof-quotation-product-uom-live.mjs for product MUoM + PDF UoM column.');
} else {
  console.log(`❌ ${fail} section(s) FAILED — do not commit until fixed.`);
}
console.log('═'.repeat(64));
process.exit(fail > 0 ? 1 : 0);
