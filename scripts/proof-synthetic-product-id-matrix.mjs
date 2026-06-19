#!/usr/bin/env node
/**
 * Proof — synthetic product IDs must not hit UUID DB columns.
 * Usage: node scripts/proof-synthetic-product-id-matrix.mjs
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
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}` };
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  SYNTHETIC PRODUCT ID PROOF MATRIX                           ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

section('productIdBoundary.ts (server)', existsSync(join(serverDir, 'src/utils/productIdBoundary.ts')));
section('productIdBoundary.ts (client)', existsSync(join(clientDir, 'src/utils/productIdBoundary.ts')));
section('Migration 522 pos_order_items nullable', existsSync(join(root, 'shared/sql/522_pos_order_items_product_id_nullable.sql')));

const ordersSvc = read('SamplePOS.Server/src/modules/orders/ordersService.ts');
section('ordersService uses normalizeProductIdForDb', ordersSvc.includes('normalizeProductIdForDb'));

const dnCtrl = read('SamplePOS.Server/src/modules/delivery-notes/deliveryNoteController.ts');
section('delivery note productId optional in schema', dnCtrl.includes('productId: z.string().uuid().optional()'));

const posPage = read('samplepos.client/src/pages/pos/POSPage.tsx');
section('POS hold sends null productId for custom lines', posPage.includes('isServiceOrCustom ? null : item.id'));

const dnDrawer = read('samplepos.client/src/components/quotations/CreateDeliveryNoteDrawer.tsx');
section('CreateDeliveryNoteDrawer filters non-catalog lines', dnDrawer.includes('isPersistedProductId'));

const clientTests = run('npx', ['vitest', 'run', 'src/__tests__/productIdBoundary.spec.ts'], clientDir);
section('productIdBoundary.spec.ts', clientTests.ok, clientTests.ok ? 'PASS' : clientTests.out.slice(-200));

const serverTests = run(
  'npm',
  ['test', '--', 'src/utils/productIdBoundary.test.ts', 'src/modules/orders/ordersRoutes.validation.test.ts', '--runInBand'],
  serverDir
);
section('server productId + orders validation tests', serverTests.ok, serverTests.ok ? 'jest PASS' : serverTests.out.slice(-300));

const build = run('npm', ['run', 'build'], serverDir);
section('Server tsc build', build.ok);

console.log('\n' + '═'.repeat(64));
console.log(fail === 0 ? '✅ SYNTHETIC PRODUCT ID PROOF — ALL PASS' : `❌ ${fail} FAILED`);
console.log('═'.repeat(64));
process.exit(fail > 0 ? 1 : 0);
