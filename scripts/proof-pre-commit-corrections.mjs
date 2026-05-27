#!/usr/bin/env node
/**
 * Pre-commit proof gate: supplier reassignment wizard + return-to-supplier limits.
 * Run: node scripts/proof-pre-commit-corrections.mjs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'SamplePOS.Server');

const results = [];

function run(label, cmd, args, opts = {}) {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? serverDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...opts.env },
  });
  const ok = r.status === 0;
  results.push({ label, ok });
  if (!ok) {
    console.error(`\n✗ ${label} failed (exit ${r.status})`);
  } else {
    console.log(`✓ ${label}`);
  }
  return ok;
}

console.log('═══════════════════════════════════════════════════════');
console.log(' Pre-commit proof: corrections (reassign + return GRN)');
console.log('═══════════════════════════════════════════════════════');

run('Server TypeScript build', 'npm', ['run', 'build'], { cwd: serverDir });

run('Return GRN unit tests (16)', 'npm', ['run', 'test:return-grn'], { cwd: serverDir });

run('Supplier reassignment unit tests (6)', 'node', [
  '--experimental-vm-modules',
  './node_modules/jest/bin/jest.js',
  'src/modules/corrections/supplierReassignmentService.test.ts',
  '--runInBand',
], { cwd: serverDir });

run('Phase F proof script', 'node', [path.join(root, 'scripts', 'proof-enterprise-phase-f.mjs')], {
  cwd: root,
});

run('Live API preview (local :3001)', 'node', [path.join(root, 'scripts', 'proof-supplier-reassignment-local.mjs')], {
  cwd: root,
});

run('Supplier reassignment E2E (local :3001)', 'node', [
  path.join(root, 'scripts', 'proof-supplier-reassignment-e2e.mjs'),
], {
  cwd: root,
});

console.log('\n═══════════════════════════════════════════════════════');
console.log(' Summary');
console.log('═══════════════════════════════════════════════════════');
for (const { label, ok } of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
}
const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length} proof step(s) failed — do not commit until fixed.`);
  process.exit(1);
}
console.log('\nAll pre-commit proofs passed. Safe to commit.');
process.exit(0);
