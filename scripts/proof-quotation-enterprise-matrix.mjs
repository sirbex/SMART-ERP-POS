#!/usr/bin/env node
/**
 * Enterprise proof matrix — quotation PDF export + convert-once SSOT.
 * Run before commit: npm run proof:quotation-enterprise
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = path.join(root, 'SamplePOS.Server');
const client = path.join(root, 'samplepos.client');

let pass = 0;
let fail = 0;

function run(name, cwd, cmd, args) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status === 0) {
    pass += 1;
    console.log(`  PASS  ${name}`);
    return true;
  }
  fail += 1;
  console.error(`  FAIL  ${name}`);
  if (r.stdout) console.error(r.stdout.slice(-2000));
  if (r.stderr) console.error(r.stderr.slice(-2000));
  return false;
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  PROOF — Quotation enterprise (PDF + convert-once SSOT)      ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const serverTests = [
  'src/modules/quotations/quotationGuards.test.ts',
  'src/modules/quotations/quotationConvertSSOT.test.ts',
  'src/modules/quotations/quotationRepository.markFirstDN.test.ts',
  'src/modules/quotations/quotationRepository.openOnly.test.ts',
  'src/modules/delivery-notes/deliveryNoteService.firstDnClaim.test.ts',
  'src/modules/distribution/convertFromQuotation.test.ts',
  'src/modules/sales/quoteConvertibilityGuard.test.ts',
  'src/modules/sales/salesService.quoteStrictReject.test.ts',
  'src/modules/documents/documentRoutes.quotationPdf.test.ts',
  'src/modules/grir-clearing/grirClearingRepository.test.ts',
  'src/modules/products/uomService.test.ts',
];

run(
  'Server quotation + PDF unit tests',
  server,
  'npm',
  ['test', '--', ...serverTests, '--runInBand', '--forceExit'],
);

run('Server TypeScript build', server, 'npm', ['run', 'build']);

run(
  'Client download PDF contract',
  client,
  'npm',
  ['test', '--', 'download.quotationPdf', '--run'],
);

run(
  'Client quotation calculations',
  client,
  'npm',
  ['test', '--', 'quotation-calculations', '--run'],
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
