#!/usr/bin/env node
/**
 * Proof: PO net-received model (Phase 1B) + MUoM quotation/delivery tests.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'SamplePOS.Server');

console.log('proof-po-net-received-muom: unit tests…\n');

const unit = spawnSync(
  'node',
  [
    '--experimental-vm-modules',
    './node_modules/jest/bin/jest.js',
    'src/modules/purchase-orders/purchaseOrderNetReceived.test.ts',
    'src/modules/quotations/quotationSaleUom.test.ts',
    'src/modules/delivery-notes/deliveryNoteUom.test.ts',
    'src/modules/goods-receipts/goodsReceiptReverse.test.ts',
    '--runInBand',
    '--forceExit',
  ],
  { cwd: serverDir, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (unit.status !== 0) {
  console.error('\nproof-po-net-received-muom: FAILED');
  process.exit(unit.status ?? 1);
}

console.log('\nproof-po-net-received-muom: ALL PASS\n');
