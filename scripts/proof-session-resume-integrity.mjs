#!/usr/bin/env node
/**
 * Enterprise proof — tab resume / UI lag integrity (hard fail)
 *
 * Proves (with tests + build, not theory):
 *   1) Permanent structural lock (INVARIANT_SESSION_RESUME_INTEGRITY_v1)
 *   2) Behavioral resume ordering + proactive auth refresh
 *   3) Session reliability suite (coordinator + auth state machine)
 *   4) Session death login invariant (no regression)
 *   5) Client production build
 *
 *   node scripts/proof-session-resume-integrity.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const client = path.join(root, 'samplepos.client');

let failed = 0;
function pass(msg) {
  console.log(`PASS ${msg}`);
}
function fail(msg) {
  console.error(`FAIL ${msg}`);
  failed++;
}

function runVitest(testFiles, label) {
  console.log('\n' + '═'.repeat(60));
  console.log(` ${label}`);
  console.log('═'.repeat(60));

  const r = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vitest', 'run', ...testFiles],
    {
      cwd: client,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    },
  );

  if (r.status !== 0) {
    fail(label);
    return false;
  }
  pass(label);
  return true;
}

console.log('ENTERPRISE PROOF: INVARIANT_SESSION_RESUME_INTEGRITY_v1');
console.log('Working directory:', client);

runVitest(
  [
    'src/__tests__/session-resume-integrity.invariant.lock.test.ts',
    'src/__tests__/session-resume-integrity.proof.test.ts',
  ],
  'proof — session-resume-integrity lock + behavioral',
);

runVitest(['src/__tests__/session-reliability.spec.ts'], 'proof — session-reliability (coordinator + auth)');

runVitest(
  [
    'src/__tests__/session-death-login.invariant.lock.test.ts',
    'src/__tests__/session-force-login-redirect.proof.test.ts',
  ],
  'proof — session-death-login (no regression)',
);

console.log('\n' + '═'.repeat(60));
console.log(' proof — Client production build');
console.log('═'.repeat(60));

const build = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'build'],
  {
    cwd: client,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  },
);

if (build.status !== 0) {
  fail('Vite production bundle build');
  process.exit(1);
}
pass('Vite production bundle build');

const proofJson = path.join(root, 'PROOF_SESSION_RESUME_INTEGRITY.json');
const proofMd = path.join(root, 'PROOF_SESSION_RESUME_INTEGRITY.md');

if (!fs.existsSync(proofJson) || !fs.existsSync(proofMd)) {
  fail('missing PROOF_SESSION_RESUME_INTEGRITY artifacts');
} else {
  const json = JSON.parse(fs.readFileSync(proofJson, 'utf8'));
  if (json.summary?.verdict !== 'PASS' || json.summary?.fail !== 0) {
    fail(`proof JSON verdict not PASS: ${JSON.stringify(json.summary)}`);
  } else {
    pass(`evidence artifact (${json.summary.pass}/${json.summary.total} gates)`);
  }
}

console.log('\n' + '═'.repeat(60));
if (failed > 0) {
  console.error(`proof-session-resume-integrity: ${failed} CHECK(S) FAILED`);
  process.exit(1);
}

console.log('proof-session-resume-integrity: ALL CHECKS PASSED');
console.log('');
console.log('Enterprise resume guarantees (verified, not alleged):');
console.log('  • Single visibility SSOT — coordinator + idle timeout only');
console.log('  • Proactive token refresh on tab resume before deferred API work');
console.log('  • Auth phase ordering proven — after-phase never races ahead');
console.log('  • waitForAuthenticated unblocks immediately after proactive refresh');
console.log('  • No refetchOnWindowFocus storms on cash register / multistore');
console.log('  • Peer TOKEN_REFRESH + narrowed auth_token storage (no initAuth storm)');
console.log('  • Session death login invariant still PASS (no security regression)');
console.log('  • Production client build PASS');
console.log('');
console.log('Evidence: PROOF_SESSION_RESUME_INTEGRITY.json');
console.log('═'.repeat(60));

process.exit(0);
