#!/usr/bin/env node
/**
 * POS pricing regression gate — AT_COST, FIFO layers, below-cost block, cart validation.
 *
 * Usage:
 *   npm run test:pos-pricing-regression
 *   npm run test:at-cost-regression          (alias)
 *   node scripts/run-at-cost-regression.mjs --live   # + local API proofs
 *
 * Contract: POS_PRICING_REGRESSION.md
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const live = process.argv.includes('--live');

function run(label, cwd, cmd, args) {
  console.log(`\n=== ${label} ===\n`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`\n❌ ${label} FAILED (exit ${r.status})\n`);
    console.error('See POS_PRICING_REGRESSION.md — do not merge until this passes.\n');
    process.exit(r.status ?? 1);
  }
}

run('Server — POS pricing unit tests', path.join(root, 'SamplePOS.Server'), 'npm', [
  'run',
  'test:pos-pricing-regression',
]);

run('Client — POS cart / validation unit tests', path.join(root, 'samplepos.client'), 'npm', [
  'run',
  'test:pos-pricing-regression',
]);

if (live) {
  run('Local proof — POS AT_COST reprice', root, 'npm', ['run', 'proof:pos-at-cost-reprice:local']);
  run('Local proof — FIFO layers API', root, 'npm', ['run', 'proof:at-cost-fifo-layers:local']);
  run('Local proof — below-cost block + audit', root, 'npm', ['run', 'proof:sale-below-cost:local']);
} else {
  console.log('\n(Skipping live API proofs. Run: npm run proof:pos-pricing:local)\n');
}

console.log('\n✅ POS pricing regression gate passed.\n');
