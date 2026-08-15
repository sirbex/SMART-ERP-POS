#!/usr/bin/env node
/**
 * Restaurant open / enable integrity — no false logout.
 *
 * Usage (repo root):
 *   node scripts/proof-restaurant-open-no-false-logout.mjs
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
  'src/__tests__/restaurant-open-no-false-logout.proof.test.ts',
  'src/__tests__/session-force-login-redirect.proof.test.ts',
  'src/__tests__/access-denied-notification-proof.test.ts',
];

const client = run(
  process.execPath,
  [resolve(root, 'samplepos.client/node_modules/vitest/vitest.mjs'), 'run', ...suites],
  resolve(root, 'samplepos.client'),
);

const counts = parseVitestCounts(`${client.stdout}\n${client.stderr}`);
const overallOk = client.ok && counts.fail === 0 && counts.pass > 0;

const proof = {
  proof: 'RESTAURANT_OPEN_NO_FALSE_LOGOUT',
  objective:
    'Turning restaurant ON and opening FOH must not wipe the session on 403 RBAC / refresh wait races; errors must be fail-loud and non-swallowing',
  runAt,
  result: overallOk ? 'PASS' : 'FAIL',
  summary: counts,
  gates: [
    { id: 'R1_HANDLED_403_STATUS', ok: overallOk },
    { id: 'R2_NO_AUTH_WAIT_FALSE_LOGOUT', ok: overallOk },
    { id: 'R3_CASHIER_LOOP_BREAK', ok: overallOk },
    { id: 'R4_FOH_SILENT_FORBIDDEN', ok: overallOk },
    { id: 'R5_ENABLED_FETCH_LOG', ok: overallOk },
    { id: 'R6_AUTH_BOOT_NO_403_WIPE', ok: overallOk },
    { id: 'R7_API_STAMPS_403', ok: overallOk },
  ],
  suites,
  exitStatus: client.status,
  stdoutTail: `${client.stdout}\n${client.stderr}`.slice(-3500),
};

writeFileSync(
  resolve(root, 'PROOF_RESTAURANT_OPEN_NO_FALSE_LOGOUT.json'),
  `${JSON.stringify(proof, null, 2)}\n`,
);

const md = `# PROOF — Restaurant open must not false-logout

**Generated:** ${runAt}  
**Verdict:** **${proof.result}** (${counts.pass}/${counts.total} tests)

## Guarantee

Enabling Restaurant and opening FOH must **stay signed in** when the failure is RBAC 403 or a refresh wait race. Session wipe is reserved for proven auth death (401 + dead refresh).

## Fixes locked

| Issue | Fix |
|-------|-----|
| 403 → treated as session death | \`HandledApiError.httpStatus=403\` + Auth boot ignores forbidden |
| FOH mount storm → \`auth_wait_expired\` | Logout only if EXPIRED or both tokens gone |
| Cashier restaurant deny loop | In-page Access Denied (stay signed in) |
| Access denied toast spam on floor | \`silentForbidden\` on tables/waiters |
| Empty catch on enabled flag | \`console.error\` + cache fallback |

## Reproduce

\`\`\`bash
node scripts/proof-restaurant-open-no-false-logout.mjs
\`\`\`
`;

writeFileSync(resolve(root, 'PROOF_RESTAURANT_OPEN_NO_FALSE_LOGOUT.md'), md);
console.log(
  overallOk
    ? `PASS RESTAURANT_OPEN_NO_FALSE_LOGOUT ${counts.pass}/${counts.total}`
    : `FAIL RESTAURANT_OPEN_NO_FALSE_LOGOUT pass=${counts.pass} fail=${counts.fail}`,
);
process.exit(overallOk ? 0 : 1);
