#!/usr/bin/env node
/**
 * Phase C proofs (inventory / accounting corrections):
 * - RGRN post deducts FIFO cost_layers in the same transaction as stock + GL
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'SamplePOS.Server');

const tests = [
  'src/modules/return-grn/returnGrnService.costLayers.test.ts',
];

console.log('proof-enterprise-phase-c: running Jest proofs…\n');

const result = spawnSync(
  'node',
  [
    '--experimental-vm-modules',
    './node_modules/jest/bin/jest.js',
    ...tests,
    '--runInBand',
  ],
  { cwd: serverDir, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (result.status !== 0) {
  console.error('\nproof-enterprise-phase-c: FAILED');
  process.exit(result.status ?? 1);
}

console.log('\nproof-enterprise-phase-c: PASS');
