#!/usr/bin/env node
/**
 * Run all pricing phase 1–3 tests (server unit + client unit + optional live API).
 *
 * Usage:
 *   node scripts/run-pricing-phase-tests.mjs
 *   node scripts/run-pricing-phase-tests.mjs --live
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
    console.error(`\n${label} FAILED (exit ${r.status})\n`);
    process.exit(r.status ?? 1);
  }
}

run('Server — pricing phases (Jest)', path.join(root, 'SamplePOS.Server'), 'npm', [
  'run',
  'test:pricing-phases',
]);

run('Client — pricing phases (Vitest)', path.join(root, 'samplepos.client'), 'npm', [
  'run',
  'test:pricing-phases',
]);

if (live) {
  run('Live API — pricing phases', root, 'node', ['scripts/test-pricing-phases-live.mjs']);
} else {
  console.log('\n(Skipping live API tests. Run with --live when server + DB are up.)\n');
}

console.log('\nAll pricing phase test suites passed.\n');
