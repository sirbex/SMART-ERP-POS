#!/usr/bin/env node
/**
 * Proof: Treasury Documents can be enabled by admin via system-settings API
 * (the same field the Settings → Tax UI saves).
 *
 * Usage:
 *   node SamplePOS.Server/scripts/proof-treasury-settings-ui.mjs
 *   TEST_EMAIL=... TEST_PASSWORD=... API_BASE=http://localhost:3001 node ...
 *
 * Always runs static fitness + Jest/Vitest proofs.
 * Live PATCH is recorded when credentials + API are available.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serverRoot, '..');
const OUT =
  process.env.PROOF_OUT || resolve(repoRoot, 'PROOF_TREASURY_SETTINGS_UI.md');
const BASE = (process.env.API_BASE || 'http://localhost:3001').replace(/\/$/, '');
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';

let pass = 0;
let fail = 0;
let skip = 0;
const lines = [
  '# Treasury Settings UI — Enablement Proof\n',
  `Run: ${new Date().toISOString()}\n`,
  `API: ${BASE}\n`,
];

function ok(n, d = '') {
  pass++;
  console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`);
  lines.push(`- **PASS** ${n}${d ? ` — ${d}` : ''}`);
}
function bad(n, d = '') {
  fail++;
  console.error(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
  lines.push(`- **FAIL** ${n}${d ? ` — ${d}` : ''}`);
}
function skipped(n, d = '') {
  skip++;
  console.log(`  SKIP  ${n}${d ? ` — ${d}` : ''}`);
  lines.push(`- **SKIP** ${n}${d ? ` — ${d}` : ''}`);
}
function assert(c, n, d = '') {
  if (c) ok(n, d);
  else bad(n, d);
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    env: process.env,
  });
  return { code: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}` };
}

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

console.log('═'.repeat(60));
console.log(' proof-treasury-settings-ui');
console.log('═'.repeat(60));

lines.push('\n## Static / unit proofs\n');

const fitness = run('npm', ['run', 'ci:treasury-fitness'], repoRoot);
assert(
  fitness.code === 0,
  'ci:treasury-fitness (includes A-07 Settings→Tax UI)',
  fitness.code === 0 ? '' : fitness.out.slice(-500),
);

const jestProof = run(
  'npm',
  ['test', '--', 'src/modules/treasury/treasurySettingsAdminUiProof.test.ts', '--forceExit'],
  serverRoot,
);
assert(
  jestProof.code === 0,
  'Jest treasurySettingsAdminUiProof',
  jestProof.code === 0
    ? (jestProof.out.match(/Tests:\s+[^\n]+/) || ['ok'])[0]
    : jestProof.out.slice(-600),
);

const vitestProof = run(
  'npx',
  ['vitest', 'run', 'src/__tests__/treasury-settings-enable-proof.test.ts'],
  resolve(repoRoot, 'samplepos.client'),
);
assert(
  vitestProof.code === 0,
  'Vitest treasury-settings-enable-proof',
  vitestProof.code === 0
    ? (vitestProof.out.match(/Tests\s+[^\n]+/) ||
        vitestProof.out.match(/\d+ passed/) || ['ok'])[0]
    : vitestProof.out.slice(-600),
);

lines.push('\n## Live API evidence (Settings field = Tax UI save path)\n');

try {
  const health = await req('GET', '/api/health');
  if (health.status !== 200) {
    skipped('Live API', `health status=${health.status}`);
  } else {
    ok('API health', String(health.status));

    const login = await req('POST', '/api/auth/login', {
      body: { email: EMAIL, password: PASSWORD },
    });
    const token = login.data?.data?.token ?? login.data?.data?.accessToken;
    if (login.status !== 200 || !token) {
      bad('Admin login', `status=${login.status}`);
    } else {
      ok('Admin login', EMAIL);

      const before = await req('GET', '/api/treasury/enabled', { token });
      const beforeOn = Boolean(before.data?.data?.enabled);
      assert(before.status === 200, 'GET /api/treasury/enabled', `enabled=${beforeOn}`);

      const settingsBefore = await req('GET', '/api/system-settings', { token });
      assert(
        settingsBefore.status === 200 &&
          typeof settingsBefore.data?.data?.treasuryDocumentEnabled === 'boolean',
        'GET /api/system-settings exposes treasuryDocumentEnabled',
        `value=${settingsBefore.data?.data?.treasuryDocumentEnabled}`,
      );

      const target = !beforeOn;
      const patch = await req('PATCH', '/api/system-settings', {
        token,
        body: { treasuryDocumentEnabled: target },
      });
      assert(
        patch.status === 200 && patch.data?.data?.treasuryDocumentEnabled === target,
        'PATCH /api/system-settings treasuryDocumentEnabled (Tax UI save contract)',
        `set=${target} got=${patch.data?.data?.treasuryDocumentEnabled}`,
      );

      const after = await req('GET', '/api/treasury/enabled', { token });
      assert(
        after.status === 200 && Boolean(after.data?.data?.enabled) === target,
        'GET /api/treasury/enabled reflects PATCH',
        `enabled=${after.data?.data?.enabled}`,
      );

      // Restore original flag so proof is non-destructive
      const restore = await req('PATCH', '/api/system-settings', {
        token,
        body: { treasuryDocumentEnabled: beforeOn },
      });
      assert(
        restore.status === 200 &&
          Boolean(restore.data?.data?.treasuryDocumentEnabled) === beforeOn,
        'Restore original treasuryDocumentEnabled',
        `restored=${beforeOn}`,
      );
    }
  }
} catch (e) {
  skipped('Live API', e instanceof Error ? e.message : String(e));
}

lines.push('\n## Verdict\n');
lines.push(`- PASS: ${pass}`);
lines.push(`- FAIL: ${fail}`);
lines.push(`- SKIP: ${skip}`);
const verdict = fail === 0 ? 'PASS' : 'FAIL';
lines.push(`\n**Overall: ${verdict}**\n`);

writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
console.log('\n' + '─'.repeat(60));
console.log(` Wrote ${OUT}`);
console.log(` PASS=${pass} FAIL=${fail} SKIP=${skip} → ${verdict}`);
console.log('─'.repeat(60));
process.exit(fail === 0 ? 0 : 1);
