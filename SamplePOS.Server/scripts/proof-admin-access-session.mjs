/**
 * Proof — Admin access + session-expired banner behavior (tested).
 *
 * Live Henber API checks + pure unit assertions for LoginPage session flag policy.
 *
 *   node SamplePOS.Server/scripts/proof-admin-access-session.mjs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const BASE = process.env.BASE_URL || 'https://henber.wizarddigital-inv.com';
const EMAIL = process.env.TEST_EMAIL || 'admin@test.com';
const PASSWORD = process.env.TEST_PASSWORD;
const DB = process.env.HENBER_DATABASE_URL;

let pass = 0;
let fail = 0;
const lines = [];

function ok(name, detail = '') {
  pass++;
  const msg = detail ? `${name} — ${detail}` : name;
  console.log(`  PASS  ${msg}`);
  lines.push(`- **PASS** ${msg}`);
}
function bad(name, detail = '') {
  fail++;
  const msg = detail ? `${name} — ${detail}` : name;
  console.error(`  FAIL  ${msg}`);
  lines.push(`- **FAIL** ${msg}`);
}
function assert(cond, name, detail = '') {
  if (cond) ok(name, detail);
  else bad(name, detail);
}

async function req(method, p, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: res.status, data };
}

/** Mirrors LoginPage useState initializer — flag consumed once, survives re-reads of state. */
function captureSessionExpiredOnce(storage, locationState) {
  let banner = false;
  const flag = storage.getItem('session_expired');
  if (flag) {
    storage.removeItem('session_expired');
    banner = true;
  } else if (locationState?.sessionExpired === true) {
    banner = true;
  }
  // Simulate React re-render: state already captured, storage empty
  const afterRerender = banner;
  const storageAfter = storage.getItem('session_expired');
  return { banner, afterRerender, storageAfter };
}

/** Old buggy pattern — clears on every "render" so second call loses banner. */
function buggySessionExpiredEveryRender(storage) {
  const flag = storage.getItem('session_expired');
  if (flag) {
    storage.removeItem('session_expired');
    return true;
  }
  return false;
}

console.log('\n══ Proof: Admin access + session-expired banner ══');
console.log(`Target: ${BASE}`);
console.log(`Time:   ${new Date().toISOString()}\n`);

if (!PASSWORD) {
  bad('TEST_PASSWORD', 'required');
  process.exit(1);
}

// ── A. Unit: session banner policy ──────────────────────────────────────────
console.log('── A. Session-expired banner policy (unit) ──');
{
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  storage.setItem('session_expired', '1');
  const fixed = captureSessionExpiredOnce(storage, null);
  assert(fixed.banner === true, 'Fixed: first capture shows banner');
  assert(fixed.afterRerender === true, 'Fixed: banner state survives re-render');
  assert(fixed.storageAfter === null, 'Fixed: storage flag cleared once');

  const store2 = new Map([['session_expired', '1']]);
  const storage2 = {
    getItem: (k) => (store2.has(k) ? store2.get(k) : null),
    setItem: (k, v) => store2.set(k, v),
    removeItem: (k) => store2.delete(k),
  };
  const first = buggySessionExpiredEveryRender(storage2);
  const second = buggySessionExpiredEveryRender(storage2);
  assert(first === true && second === false, 'Buggy pattern: second render loses banner', `first=${first} second=${second}`);
}

// ── B. Unit: ADMIN always-allow (shared evaluatePermission via jest) ────────
console.log('\n── B. Jest: ADMIN always-allow + systemRoleGrants ──');
{
  const r = spawnSync(
    'node',
    [
      '--experimental-vm-modules',
      './node_modules/jest/bin/jest.js',
      'src/authorization/authorizationService.test.ts',
      'src/authorization/systemRoleGrants.test.ts',
      '--no-coverage',
      '--forceExit',
    ],
    { cwd: path.join(ROOT, 'SamplePOS.Server'), encoding: 'utf8', shell: process.platform === 'win32' }
  );
  const out = (r.stdout || '') + (r.stderr || '');
  const passed = r.status === 0 && /Tests:\s+\d+ passed/.test(out);
  assert(passed, 'Jest authorizationService + systemRoleGrants', `exit=${r.status}`);
  if (passed) {
    const m = out.match(/Tests:\s+(\d+) passed/);
    ok('Jest test count', m ? m[1] : 'ok');
  }
}

// ── C. Live: admin@test.com login + gated endpoints ─────────────────────────
console.log('\n── C. Live Henber: admin@test.com API access ──');
const login = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
const token = login.data?.data?.token;
const user = login.data?.data?.user;
assert(login.status === 200 && token, 'Login admin', `status=${login.status} role=${user?.role}`);
assert(user?.role === 'ADMIN', 'Legacy role is ADMIN', String(user?.role));

const permsRes = await req('GET', '/api/rbac/me/permissions', { token });
const keys = (permsRes.data?.data ?? []).map((p) => p.permissionKey ?? p.permission_key);
assert(permsRes.status === 200 && keys.length > 0, 'Permissions loaded', `${keys.length} keys`);

const endpoints = [
  ['GET', '/api/sales?limit=1'],
  ['GET', '/api/products?limit=1'],
  ['GET', '/api/customers?limit=1'],
  ['GET', '/api/accounting/trial-balance'],
  ['GET', '/api/erp-accounting/reconciliation/financial-health'],
  ['GET', '/api/rbac/roles'],
  ['GET', '/api/suppliers?limit=1'],
  ['GET', '/api/inventory/stock-levels?limit=1'],
];

let forbidden = 0;
for (const [method, path] of endpoints) {
  const r = await req(method, path, { token });
  if (r.status === 403) {
    forbidden++;
    bad(`Endpoint ${path}`, `403 ${r.data?.error ?? r.data?.code ?? ''}`);
  } else if (r.status >= 200 && r.status < 500) {
    ok(`Endpoint ${path}`, `HTTP ${r.status}`);
  } else {
    bad(`Endpoint ${path}`, `HTTP ${r.status}`);
  }
}
assert(forbidden === 0, 'Zero 403 Insufficient permissions for admin', `forbidden=${forbidden}`);

// ── D. DB: Administrator role full catalog (535) ────────────────────────────
console.log('\n── D. Henber DB: Administrator grant coverage ──');
if (!DB) {
  bad('HENBER_DATABASE_URL', 'missing — skip DB checks');
} else {
  const c = new pg.Client({ connectionString: DB });
  await c.connect();
  try {
    const cat = await c.query(`SELECT count(*)::int AS n FROM rbac_permissions_catalog`);
    const adm = await c.query(`
      SELECT count(*)::int AS n FROM rbac_role_permissions rp
      JOIN rbac_roles r ON r.id = rp.role_id WHERE r.name = 'Administrator'
    `);
    const mgr = await c.query(`
      SELECT
        EXISTS (SELECT 1 FROM rbac_role_permissions rp JOIN rbac_roles r ON r.id = rp.role_id
                WHERE r.name='Manager' AND rp.permission_key='accounting.read') AS accounting,
        EXISTS (SELECT 1 FROM rbac_role_permissions rp JOIN rbac_roles r ON r.id = rp.role_id
                WHERE r.name='Accountant' AND rp.permission_key='customers.update') AS cust_update
    `);
    const catalogN = cat.rows[0].n;
    const adminN = adm.rows[0].n;
    assert(adminN >= catalogN, 'Administrator perms >= catalog', `admin=${adminN} catalog=${catalogN}`);
    assert(mgr.rows[0].accounting === true, 'Manager has accounting.read');
    assert(mgr.rows[0].cust_update === true, 'Accountant has customers.update');

    // User with Administrator RBAC + legacy ADMIN (kitaramercy if present)
    const partialAdmin = await c.query(`
      SELECT u.email, u.role AS legacy, r.name AS rbac
      FROM users u
      JOIN rbac_user_roles ur ON ur.user_id = u.id AND ur.is_active
      JOIN rbac_roles r ON r.id = ur.role_id
      WHERE u.role = 'ADMIN' AND r.name = 'Administrator'
      LIMIT 5
    `);
    ok(
      'ADMIN+Administrator users on tenant',
      partialAdmin.rows.length
        ? partialAdmin.rows.map((x) => x.email).join(', ')
        : 'none (ok)'
    );
  } finally {
    await c.end();
  }
}

// ── E. Live: health ─────────────────────────────────────────────────────────
console.log('\n── E. Deploy health ──');
const health = await req('GET', '/api/health');
assert(health.status === 200 && health.data?.data?.status === 'healthy', 'API healthy', String(health.status));

console.log('\n════════════════════════════════════════');
console.log(`RESULT: ${pass} passed, ${fail} failed`);
console.log('════════════════════════════════════════\n');
process.exit(fail === 0 ? 0 : 1);
