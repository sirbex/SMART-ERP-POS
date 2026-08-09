#!/usr/bin/env node
/**
 * Permanent enforcement runner — Session death → Login invariant.
 * Exit 0 only on full lock + proof PASS. Safe for hard-fail CI.
 *
 *   node scripts/proof-session-death-login-invariant.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const client = path.join(root, 'samplepos.client');

const tests = [
  'src/__tests__/session-death-login.invariant.lock.test.ts',
  'src/__tests__/session-force-login-redirect.proof.test.ts',
];

console.log('PERMANENT LOCK: INVARIANT_SESSION_DEATH_LOGIN_v1');
console.log('Working directory:', client);
console.log('Tests:', tests.join(', '));

const r = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vitest', 'run', ...tests],
  {
    cwd: client,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  },
);

if (r.status !== 0) {
  console.error('\nFAIL — session death login invariant (hard fail). Do not merge.');
  process.exit(r.status ?? 1);
}

const lockMd = path.join(root, 'PROOF_SESSION_DEATH_LOGIN_INVARIANT_LOCK.md');
const lockJson = path.join(root, 'PROOF_SESSION_DEATH_LOGIN_INVARIANT_LOCK.json');
const guarantee = path.join(root, 'PERMANENT_GUARANTEE_SESSION_DEATH_LOGIN.md');

for (const p of [lockMd, lockJson, guarantee]) {
  if (!fs.existsSync(p)) {
    console.error(`FAIL — missing evidence artifact: ${path.basename(p)}`);
    process.exit(1);
  }
}

const json = JSON.parse(fs.readFileSync(lockJson, 'utf8'));
if (json.summary?.verdict !== 'PASS' || json.summary?.fail !== 0) {
  console.error('FAIL — lock JSON verdict is not PASS:', json.summary);
  process.exit(1);
}

const g = fs.readFileSync(guarantee, 'utf8');
if (!g.includes('**PASS**') || !g.includes('INVARIANT_SESSION_DEATH_LOGIN_v1')) {
  console.error('FAIL — permanent guarantee stamp incomplete');
  process.exit(1);
}

console.log('\nPASS — INVARIANT_SESSION_DEATH_LOGIN_v1 sealed');
console.log('Evidence:', path.basename(lockMd), path.basename(guarantee));
process.exit(0);
