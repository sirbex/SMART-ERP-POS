#!/usr/bin/env node
/**
 * Proof: AT_COST FIFO cart split policy — one blended line unless impossible.
 *
 * Golden scenarios (must all pass):
 *   1. Ozempic 3 strips: 1@1.6M + 2@1.15M → ONE line @ 1.3M (3,900,000 total)
 *   2. Qty 2 @ 20k + 18k → ONE line @ 19k (38,000 total)
 *   3. Qty 2 @ 20k + 18,001 → MUST split (no whole-cent blended unit)
 *   4. Legacy strip batches normalize to base for correct FEFO layers
 *
 * Usage: npm run proof:at-cost-fifo-split-policy
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;

function run(label, cwd, cmd, args, { shell = true } = {}) {
  console.log(`\n=== ${label} ===\n`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell });
  if (r.status !== 0) {
    console.error(`\n❌ ${label} FAILED\n`);
    failed++;
  } else {
    console.log(`\n✅ ${label} passed\n`);
  }
}

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║  AT_COST FIFO split policy — tested proof               ║');
console.log('╚══════════════════════════════════════════════════════════╝');

run(
  'Client proof — mustSplit / Ozempic blended line',
  path.join(root, 'samplepos.client'),
  'npx',
  ['vitest', 'run', 'src/__tests__/posCartAtCost.spec.ts'],
);

run(
  'Server proof — legacy batch normalize + Ozempic FEFO layers',
  path.join(root, 'SamplePOS.Server'),
  process.execPath,
  [
    '--experimental-vm-modules',
    './node_modules/jest/bin/jest.js',
    'src/modules/pricing/atCostIssuePrice.test.ts',
    '--testNamePattern',
    'normalizeLegacy|Ozempic|previewFefoIssueLayers splits legacy',
    '--no-coverage',
  ],
  { shell: false },
);

console.log('\n' + '═'.repeat(60));
if (failed > 0) {
  console.log(`\n❌ PROOF FAILED — ${failed} suite(s) did not pass\n`);
  process.exit(1);
}
console.log('\n✅ ALL PROOF SCENARIOS PASSED');
console.log('   • Ozempic: 3 × 1,300,000 = 3,900,000 (one blended line)');
console.log('   • 20k+18k: 2 × 19,000 = 38,000 (one blended line)');
console.log('   • 20k+18,001: split required (rounding impossible)');
console.log('   • Legacy strip batches → base FEFO layers\n');
process.exit(0);
