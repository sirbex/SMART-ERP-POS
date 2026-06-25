#!/usr/bin/env node
/**
 * Enterprise proof matrix — quotation → invoice PDF (unit + integration + optional live).
 *   npm run proof:quotation-invoice-pdf
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = path.join(root, 'SamplePOS.Server');
const client = path.join(root, 'samplepos.client');

let pass = 0;
let fail = 0;

function run(name, cwd, cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  if (r.status === 0) {
    pass += 1;
    console.log(`  PASS  ${name}`);
    return true;
  }
  fail += 1;
  console.error(`  FAIL  ${name}`);
  if (r.stdout) console.error(r.stdout.slice(-3000));
  if (r.stderr) console.error(r.stderr.slice(-3000));
  return false;
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  PROOF — Quotation → Invoice PDF (enterprise matrix)         ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const serverTests = [
  'src/modules/documents/quotationInvoicePdf.contract.test.ts',
  'src/modules/documents/quotationInvoicePdf.integration.test.ts',
  'src/modules/documents/documentRoutes.quotationPdf.test.ts',
  'src/modules/invoices/invoiceSourceQuotation.test.ts',
  'src/modules/invoices/invoiceService.test.ts',
];

run('Server PDF contract + integration tests', server, 'npm', [
  'test',
  '--',
  ...serverTests,
  '--runInBand',
  '--forceExit',
]);

run('Server TypeScript build', server, 'npm', ['run', 'build:prod']);

run('Client quotation PDF download contract', client, 'npm', [
  'test',
  '--',
  'download.quotationPdf',
  '--run',
]);

const liveEnv = {
  BASE_URL: process.env.BASE_URL || process.env.PROD_URL || 'http://localhost:3001',
  TEST_EMAIL: process.env.TEST_EMAIL || 'admin@samplepos.com',
  TEST_PASSWORD: process.env.TEST_PASSWORD || 'admin123',
};

console.log(`\n  LIVE  target=${liveEnv.BASE_URL} user=${liveEnv.TEST_EMAIL}`);
const live = spawnSync('node', ['scripts/proof-quotation-invoice-pdf-live.mjs'], {
  cwd: root,
  encoding: 'utf8',
  shell: process.platform === 'win32',
  env: { ...process.env, ...liveEnv },
});
if (live.status === 0) {
  pass += 1;
  console.log('  PASS  Live API + PDF proof');
  if (live.stdout) console.log(live.stdout.split('\n').slice(-12).join('\n'));
} else {
  fail += 1;
  console.error('  FAIL  Live API + PDF proof (is API running? set BASE_URL / credentials)');
  if (live.stdout) console.error(live.stdout.slice(-2500));
  if (live.stderr) console.error(live.stderr.slice(-1500));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
