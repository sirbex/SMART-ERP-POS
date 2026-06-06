#!/usr/bin/env node
/**
 * Proof: POS search dropdown shows price + category, not SKU.
 *
 * Run: npm run proof:pos-search-display
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientDir = path.join(root, 'samplepos.client');
const serverDir = path.join(root, 'SamplePOS.Server');

let failed = 0;
function pass(msg) {
  console.log(`PASS ${msg}`);
}
function fail(msg) {
  console.error(`FAIL ${msg}`);
  failed++;
}

console.log('\n' + '═'.repeat(60));
console.log(' proof — POS product search display contract');
console.log('═'.repeat(60));

const vitest = spawnSync(
  'npm',
  ['test', '--', '--run', 'pos-product-search-display'],
  { cwd: clientDir, stdio: 'inherit', shell: true },
);
if (vitest.status !== 0) fail('pos-product-search-display.spec.ts');
else pass('pos-product-search-display.spec.ts');

console.log('\n' + '═'.repeat(60));
console.log(' proof — POS catalog SSOT (offline-first)');
console.log('═'.repeat(60));

const ssot = spawnSync(
  'npm',
  ['test', '--', '--run', 'pos-catalog-ssot'],
  { cwd: clientDir, stdio: 'inherit', shell: true },
);
if (ssot.status !== 0) fail('pos-catalog-ssot.spec.ts');
else pass('pos-catalog-ssot.spec.ts');

console.log('\n' + '═'.repeat(60));
console.log(' proof — Client production build');
console.log('═'.repeat(60));

const build = spawnSync('npm', ['run', 'build'], { cwd: clientDir, stdio: 'inherit', shell: true });
if (build.status !== 0) fail('Client production build');
else pass('Client production build');

console.log('\n' + '═'.repeat(60));
console.log(' proof — Server inventory tests');
console.log('═'.repeat(60));

const serverTest = spawnSync(
  'npm',
  ['run', 'test', '--', 'inventoryService.test'],
  { cwd: serverDir, stdio: 'inherit', shell: true },
);
if (serverTest.status !== 0) fail('inventoryService.test.ts');
else pass('inventoryService.test.ts');

if (failed > 0) {
  console.error(`\n${failed} proof step(s) failed.\n`);
  process.exit(1);
}

console.log('\nAll POS search display proofs passed.\n');
