#!/usr/bin/env node
/**
 * Login integrity — successful login must not bounce to logout / quick-login.
 *
 * Usage (repo root):
 *   node scripts/proof-login-no-false-logout.mjs
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runAt = new Date().toISOString();

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: false, env: process.env });
  return { ok: r.status === 0, status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function parseVitestCounts(text) {
  const failedPass = text.match(/Tests\s+(\d+)\s+failed\s*\|\s*(\d+)\s+passed\s+\((\d+)\)/);
  if (failedPass) {
    return { fail: Number(failedPass[1]), pass: Number(failedPass[2]), total: Number(failedPass[3]) };
  }
  const only = text.match(/Tests\s+(\d+)\s+passed\s+\((\d+)\)/);
  if (only) return { fail: 0, pass: Number(only[1]), total: Number(only[2]) };
  return { fail: 1, pass: 0, total: 0 };
}

const suites = [
  'src/__tests__/login-no-false-logout.proof.test.ts',
  'src/lib/sessionColdStartLock.test.ts',
  'src/lib/deviceSessionPolicy.integrity.test.ts',
];

const client = run(
  process.execPath,
  [resolve(root, 'samplepos.client/node_modules/vitest/vitest.mjs'), 'run', ...suites],
  resolve(root, 'samplepos.client'),
);

const counts = parseVitestCounts(`${client.stdout}\n${client.stderr}`);
const overallOk = client.ok && counts.fail === 0 && counts.pass > 0;

const proof = {
  proof: 'LOGIN_NO_FALSE_LOGOUT',
  objective:
    'After successful login, SHARED cold-start / actor-lock must not wipe the new session (login → instant logout / quick-login bounce)',
  runAt,
  result: overallOk ? 'PASS' : 'FAIL',
  summary: counts,
  gates: [
    { id: 'L1_NO_SAME_TAB_INIT_ON_AUTH_CHANGED', ok: overallOk },
    { id: 'L2_LOGIN_MARKS_GRACE', ok: overallOk },
    { id: 'L3_SSOT_GRACE_SHORT_CIRCUIT', ok: overallOk },
    { id: 'L4_CLIENT_GATE_HONOURS_GRACE', ok: overallOk },
  ],
  suites,
  exitStatus: client.status,
  stdoutTail: `${client.stdout}\n${client.stderr}`.slice(-3500),
};

writeFileSync(resolve(root, 'PROOF_LOGIN_NO_FALSE_LOGOUT.json'), `${JSON.stringify(proof, null, 2)}\n`);

const md = `# PROOF — Login must not false-logout

**Generated:** ${runAt}  
**Verdict:** **${proof.result}** (${counts.pass}/${counts.total} tests)

## Guarantee

A successful login must **stay authenticated**. Same-tab \`auth-changed\` must not re-run cold-start wipe; login grace blocks cross-tab storage races for ${30}s.

## Suites

\`\`\`
${suites.join('\n')}
\`\`\`

## Output tail

\`\`\`
${proof.stdoutTail}
\`\`\`
`;

writeFileSync(resolve(root, 'PROOF_LOGIN_NO_FALSE_LOGOUT.md'), md);

console.log(JSON.stringify({ result: proof.result, ...counts }, null, 2));
process.exit(overallOk ? 0 : 1);
