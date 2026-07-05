#!/usr/bin/env node
/**
 * Mandatory deploy gate — Multi-Store Warehouse Network (Phase 14).
 *
 * If ANY step fails: STOP — NO PUSH — NO DEPLOY
 *
 * Prerequisites:
 *   1. Tenant migrations 525–531 applied: cd SamplePOS.Server && npm run migrate
 *   2. API running: npm run dev:server
 *
 * Usage:
 *   npm run deploy:gate:warehouse-network
 *   PROOF_SKIP_PARITY=1 npm run deploy:gate:warehouse-network
 */
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const steps = [
  {
    label: 'proof:warehouse-network-phases',
    cmd: 'npm',
    args: ['run', 'proof:warehouse-network-phases'],
    cwd: root,
    env: { PROOF_SKIP_MATRIX: '1' },
  },
  {
    label: 'test:warehouse-network (unit)',
    cmd: 'npm',
    args: ['run', 'test:warehouse-network'],
    cwd: resolve(root, 'SamplePOS.Server'),
  },
  {
    label: 'proof:warehouse-network-matrix',
    cmd: 'npm',
    args: ['run', 'proof:warehouse-network-matrix'],
    cwd: root,
  },
];

function runStep(step) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(` DEPLOY GATE — ${step.label}`);
  console.log(`${'═'.repeat(60)}\n`);
  const r = spawnSync(step.cmd, step.args, {
    cwd: step.cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...step.env },
  });
  return r.status === 0;
}

console.log('\n Warehouse Network Deploy Gate (Phase 14)\n');

let allOk = true;
for (const step of steps) {
  if (!runStep(step)) {
    allOk = false;
    break;
  }
}

if (!allOk) {
  console.error('\n❌ DEPLOY GATE FAILED — do not deploy warehouse network changes\n');
  process.exit(1);
}

console.log('\n✅ Warehouse network deploy gate PASSED\n');
