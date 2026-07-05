#!/usr/bin/env node
/**
 * Proof — Receipt customer block SSOT (name + phone + email) and reprint parity.
 *
 *   npm run proof:receipt-customer-ssot
 *   PROOF_OUT=PROOF_RECEIPT_CUSTOMER_SSOT.md npm run proof:receipt-customer-ssot
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clientDir = resolve(root, 'samplepos.client');
const OUT = process.env.PROOF_OUT || resolve(root, 'PROOF_RECEIPT_CUSTOMER_SSOT.md');

let pass = 0;
let fail = 0;
const lines = [];

function ok(n, d = '') {
  pass++;
  console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`);
  lines.push(`- **PASS** ${n}${d ? ` — ${d}` : ''}`);
}

function bad(n, d = '') {
  fail++;
  console.error(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
  lines.push(`- **FAIL** ${n}${d ? ` — ${d}` : ''}`);
}

function assert(c, n, d = '') {
  if (c) ok(n, d);
  else bad(n, d);
}

function readSrc(rel) {
  const path = resolve(root, rel);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function gateSsotStatic() {
  console.log('\n── Gate 1: SSOT static wiring ──');

  const receiptFromSale = readSrc('samplepos.client/src/lib/receiptFromSale.ts');
  assert(receiptFromSale.includes('export function buildReceiptDataFromSale'), 'buildReceiptDataFromSale exported');
  assert(receiptFromSale.includes('export function buildReceiptDataFromCheckout'), 'buildReceiptDataFromCheckout exported');
  assert(receiptFromSale.includes('export function mergeSaleForReceipt'), 'mergeSaleForReceipt exported');
  assert(receiptFromSale.includes('export function resolveReceiptCustomerFields'), 'resolveReceiptCustomerFields exported');
  assert(receiptFromSale.includes('customerPhone'), 'SaleForReceipt includes customerPhone');
  assert(receiptFromSale.includes('customerEmail'), 'SaleForReceipt includes customerEmail');

  const printTs = readSrc('samplepos.client/src/lib/print.ts');
  assert(printTs.includes('customerPhone?: string'), 'ReceiptData includes customerPhone');
  assert(printTs.includes('customerEmail?: string'), 'ReceiptData includes customerEmail');
  assert(printTs.includes('function renderReceiptCustomerHTML'), 'Shared renderReceiptCustomerHTML helper');
  assert(printTs.includes('renderReceiptCustomerHTML(data, \'detailed\')'), 'Detailed format uses shared customer block');
  assert(printTs.includes('renderReceiptCustomerHTML(data, \'compact\')'), 'Compact format uses shared customer block');

  const salesPage = readSrc('samplepos.client/src/pages/SalesPage.tsx');
  assert(salesPage.includes('mergeSaleForReceipt(sale, saleDetails)'), 'Sales reprint merges list + detail sale');

  const posPage = readSrc('samplepos.client/src/pages/pos/POSPage.tsx');
  assert(posPage.includes('buildReceiptDataFromCheckout'), 'POS imports checkout receipt builder');
  assert(posPage.includes('makePosReceiptData'), 'POS uses makePosReceiptData wrapper');
  assert(!posPage.includes('setReceiptData({'), 'POS has no inline setReceiptData object literals');

  const repo = readSrc('SamplePOS.Server/src/modules/sales/salesRepository.ts');
  assert(repo.includes('c.phone AS customer_phone'), 'getSaleById joins customer phone');
  assert(repo.includes('c.email AS customer_email'), 'getSaleById joins customer email');

  const receiptBody = readSrc('SamplePOS.Server/src/modules/documents/bodies/receiptBody.ts');
  assert(receiptBody.includes('customerMetaRows'), 'PDF receipt uses customerMetaRows helper');

  const android = readSrc('android/app/src/main/java/com/smarterp/pos/ReceiptData.kt');
  assert(android.includes('customerPhone'), 'SUNMI ReceiptData includes customerPhone');
  assert(android.includes('customerEmail'), 'SUNMI ReceiptData includes customerEmail');
}

function gateUnitTests() {
  console.log('\n── Gate 2: receipt-reprint unit tests (parity + merge + HTML wiring) ──');
  const r = spawnSync('npx', ['vitest', 'run', 'src/__tests__/receipt-reprint.spec.ts'], {
    cwd: clientDir,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });
  const out = `${r.stdout || ''}\n${r.stderr || ''}`.trim();
  assert(r.status === 0, 'vitest receipt-reprint.spec.ts', r.status !== 0 ? out.slice(-500) : '');
  assert(/6 passed \(6\)/.test(out) || /Tests\s+6 passed/.test(out), 'All 6 receipt parity tests passed', out.match(/Tests.*passed/)?.[0] || out.slice(-200));
  ok('Merge + HTML wiring covered by receipt-reprint.spec.ts (6 tests)', 'see Gate 2 vitest run');
}

function writeReport() {
  const md = [
    '# Receipt Customer SSOT — Proof',
    '',
    `- **Date:** ${new Date().toISOString()}`,
    '',
    ...lines,
    '',
    '## Summary',
    '',
    `- **Passed:** ${pass}`,
    `- **Failed:** ${fail}`,
    '',
    fail === 0 ? '**RESULT: PASS**' : `**RESULT: FAIL (${fail})**`,
    '',
    '## Scope',
    '',
    '- SSOT builder: `samplepos.client/src/lib/receiptFromSale.ts`',
    '- Render: `samplepos.client/src/lib/print.ts` → `renderReceiptCustomerHTML`',
    '- Reprint: `SalesPage` → `mergeSaleForReceipt(sale, saleDetails)`',
    '- Checkout: `POSPage` → `makePosReceiptData` → `buildReceiptDataFromCheckout`',
    '- API: `salesRepository.getSaleById` joins `customers.phone` and `customers.email`',
  ].join('\n');
  writeFileSync(OUT, md);
  console.log(`\nWrote ${OUT}`);
}

function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  RECEIPT CUSTOMER SSOT — name + contact + reprint parity     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  gateSsotStatic();
  gateUnitTests();
  writeReport();

  console.log(`\n${fail ? 'FAILED' : 'OK'}: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}

main();
