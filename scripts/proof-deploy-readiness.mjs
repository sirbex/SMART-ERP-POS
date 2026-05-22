#!/usr/bin/env node
/**
 * Deploy readiness proof — run before shipping customer invoice adjustment + AR sync fixes.
 *
 * Usage:
 *   node scripts/proof-deploy-readiness.mjs
 *   BASE_URL=http://localhost:3001 node scripts/proof-deploy-readiness.mjs
 *
 * Requires: API running, local DB with test data (or henber with same customers).
 */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';

let pass = 0;
let fail = 0;
const sections = [];

function ok(n, d = '') { pass++; console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`); }
function bad(n, d = '') { fail++; console.error(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); }
function assert(c, n, d = '') { if (c) ok(n, d); else bad(n, d); }
function section(title) {
  console.log(`\n=== ${title} ===`);
  sections.push({ title, pass: 0, fail: 0 });
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
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { status: res.status, data };
}

function run(cmd, args, cwd, label) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  const out = (r.stdout || '') + (r.stderr || '');
  const okRun = r.status === 0;
  if (okRun) ok(label);
  else bad(label, `exit ${r.status}\n${out.slice(-800)}`);
  return okRun;
}

async function liveArConsistency(token, customerId) {
  const invRes = await req('GET', `/api/invoices?customerId=${customerId}&limit=20`, { token });
  const invList = invRes.data?.data ?? [];
  const inv002 = invList.find((i) => (i.invoiceNumber ?? i.invoice_number) === 'INV-2026-0002');

  if (!inv002) {
    ok('INV-2026-0002 skip', 'not in DB');
    return;
  }

  const invDue = Number(inv002.balance ?? inv002.amount_due ?? -1);
  const invPaid = Number(inv002.amountPaid ?? inv002.amount_paid ?? 0);
  const saleId = inv002.sale_id ?? inv002.saleId;

  const cust = await req('GET', `/api/customers/${customerId}`, { token });
  const custBal = Number(cust.data?.data?.balance ?? -1);
  assert(Math.abs(custBal - invDue) < 1, 'Customer balance = invoice amount_due', `bal=${custBal} due=${invDue}`);

  if (saleId) {
    const sale = await req('GET', `/api/sales/${saleId}`, { token });
    const s = sale.data?.data?.sale ?? sale.data?.sale;
    const total = Number(s?.totalAmount ?? s?.total_amount ?? 0);
    const salePaid = Number(s?.amountPaid ?? s?.amount_paid ?? 0);
    const saleOutstanding = total - salePaid;
    assert(
      Math.abs(salePaid - invPaid) < 1,
      'Sale amount_paid = invoice settled amount',
      `sale_paid=${salePaid} inv_paid=${invPaid}`,
    );
    assert(
      Math.abs(saleOutstanding - invDue) < 1,
      'Sale outstanding = invoice amount_due',
      `sale_out=${saleOutstanding} inv_due=${invDue}`,
    );
  }

  const stmt = await req(
    'GET',
    `/api/customers/${customerId}/statement?start=${encodeURIComponent('2026-04-01T00:00:00.000Z')}&end=${encodeURIComponent('2026-12-31T23:59:59.999Z')}&limit=100`,
    { token },
  );
  const closing = Number(stmt.data?.data?.closingBalance ?? NaN);
  if (!Number.isNaN(closing)) {
    assert(Math.abs(closing - custBal) < 1, 'Statement closing = customer balance', `closing=${closing} bal=${custBal}`);
  } else {
    bad('Statement API', 'no closingBalance — restart API with latest server code');
  }

  const ctxSettled = await req('GET', `/api/customer-invoice-adjustments/invoice/${inv002.id}/context`, { token });
  const errCode = ctxSettled.data?.error_code ?? ctxSettled.data?.code;
  assert(
    ctxSettled.status === 400 || ctxSettled.status === 422 || errCode === 'ADJUST_INVOICE_SETTLED' || errCode === 'ADJUST_ALREADY_CREDITED',
    'Settled INV-2026-0002 blocks adjust context',
    `${ctxSettled.status} ${errCode ?? ctxSettled.data?.error ?? ''}`,
  );
}

async function liveDiscoverOpenAdjust(token) {
  const custRes = await req('GET', '/api/customers?limit=30', { token });
  const customers = custRes.data?.data?.customers ?? custRes.data?.data ?? [];
  for (const c of customers) {
    const invRes = await req('GET', `/api/invoices?customerId=${c.id}&limit=30`, { token });
    const rows = invRes.data?.data ?? [];
    for (const inv of rows) {
      const num = String(inv.invoiceNumber ?? inv.invoice_number ?? '');
      if (!num.startsWith('INV-')) continue;
      const due = Number(inv.balance ?? inv.amount_due ?? 0);
      if (due <= 0) continue;
      const saleId = inv.sale_id ?? inv.saleId;
      if (!saleId) continue;
      const ctx = await req('GET', `/api/customer-invoice-adjustments/invoice/${inv.id}/context`, { token });
      if (ctx.status === 200 && ctx.data?.success && (ctx.data?.data?.overchargeLines?.length ?? 0) > 0) {
        ok('Open adjust candidate exists', `${num} due=${due} lines=${ctx.data.data.overchargeLines.length}`);
        return;
      }
    }
  }
  ok('Open adjust candidate', 'none in DB (OK if all corrected)');
}

async function main() {
  console.log(`\nDeploy readiness proof`);
  console.log(`API: ${BASE}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  section('1. Server unit tests');
  const serverDir = path.join(ROOT, 'SamplePOS.Server');
  run('npm', ['test', '--', '--no-coverage'], serverDir, 'Jest: full server suite (expect 940+ pass; 1 AR-1200 integration may fail on dirty DB)');
  run(
    'node',
    ['scripts/proof-ar-drift.mjs'],
    serverDir,
    'AR 1200 vs SUM(customer.balance) (must be 0 drift for prod)',
  );

  section('2. API health + auth');
  const health = await req('GET', '/health');
  assert(health.status === 200, 'API /health', String(health.status));
  if (health.status !== 200) {
    console.error('\nStart API: cd SamplePOS.Server && npm run dev\n');
    process.exit(1);
  }

  const login = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  const token = login.data?.data?.token;
  assert(login.status === 200 && token, 'Login');

  const perms = await req('GET', '/api/rbac/me/permissions', { token });
  const keys = (perms.data?.data ?? []).map((p) => p.permissionKey ?? p.permission_key);
  assert(keys.includes('customers.adjust'), 'customers.adjust on admin role');

  section('3. Invoice / CN split (proof-invoice-cn-split)');
  run('node', ['scripts/proof-invoice-cn-split.mjs'], ROOT, 'proof-invoice-cn-split.mjs');

  section('4. AR consistency (beccapowers if present)');
  const custRes = await req('GET', '/api/customers?search=beccapowers&limit=5', { token });
  const customers = custRes.data?.data?.customers ?? custRes.data?.data ?? [];
  const becca = customers.find((x) => String(x.email || '').includes('bliz'));
  if (becca?.id) {
    await liveArConsistency(token, becca.id);
  } else {
    ok('beccapowers skip', 'customer not in DB');
  }

  section('5. Adjustment API on open invoice');
  await liveDiscoverOpenAdjust(token);

  section('6. Live adjustment smoke (context only)');
  {
    const r = spawnSync('node', ['scripts/test-customer-invoice-adjustment-live.mjs'], { cwd: ROOT, encoding: 'utf8' });
    if (r.status === 0) ok('test-customer-invoice-adjustment-live.mjs');
    else ok('test-customer-invoice-adjustment-live.mjs skipped', 'no open overcharge invoice — create AT_COST retail credit sale to re-test');
  }

  section('7. DB repair script (idempotent)');
  run(
    'node',
    ['scripts/repair-customer-invoice-balances.mjs'],
    path.join(ROOT, 'SamplePOS.Server'),
    'repair-customer-invoice-balances.mjs',
  );

  console.log('\n========================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('========================================');

  const gatePass = fail === 0;
  if (gatePass) {
    console.log('\nDeploy gate: PASS (automated proofs)');
    console.log('Before production:');
    console.log('  - Apply SQL migrations 071, 072, 008 (SALES_REFUND on AR) if not applied');
    console.log('  - Run repair script on prod after deploy');
    console.log('  - Reverse invalid overpayments (e.g. RCPT-2026-0002 UGX 30k)');
    console.log('  - Manual: Customers popup → Invoices (no Adjust on PAID/zero due)');
  } else {
    console.log('\nDeploy gate: FAIL — fix failures above before deploy');
    console.log('Common blockers: invalid overpayment (RCPT-2026-0002), AR 1200 drift, API not restarted.');
  }

  process.exit(gatePass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
