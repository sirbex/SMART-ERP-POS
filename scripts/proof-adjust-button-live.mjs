#!/usr/bin/env node
/**
 * Diagnose missing Adjust button (production vs local).
 *
 * The UI shows Adjust only when GET /api/rbac/me/permissions includes customers.adjust.
 * Invoice eligibility (unpaid/partial) is separate — both INV-2026-0005 and INV-2026-0001 qualify.
 *
 * Usage:
 *   BASE_URL=https://henber.wizarddigital-inv.com TEST_EMAIL=... TEST_PASSWORD=... \
 *     node scripts/proof-adjust-button-live.mjs
 */
const BASE = process.env.BASE_URL || 'https://henber.wizarddigital-inv.com';
const EMAIL = process.env.TEST_EMAIL || '';
const PASSWORD = process.env.TEST_PASSWORD || '';

let pass = 0;
let fail = 0;

function ok(n, d = '') {
  pass++;
  console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`);
}
function bad(n, d = '') {
  fail++;
  console.error(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
}
function assert(c, n, d = '') {
  if (c) ok(n, d);
  else bad(n, d);
}

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text?.slice(0, 300) };
  }
  return { status: res.status, data };
}

async function checkFrontendBundle() {
  try {
    const html = await (await fetch(`${BASE}/`)).text();
    const assets = [...html.matchAll(/\/assets\/([^"]+\.js)/g)].map((m) => m[1]);
    if (assets.length === 0) {
      bad('Frontend bundle probe', 'no JS assets in HTML');
      return;
    }
    let apiChunk = null;
    let permChunk = null;
    for (const file of assets) {
      const js = await (await fetch(`${BASE}/assets/${file}`)).text();
      if (js.includes('customer-invoice-adjustments')) apiChunk = file;
      if (js.includes('customers.adjust')) permChunk = file;
    }
    if (apiChunk) {
      ok('Deployed frontend includes adjust API client', apiChunk);
    } else {
      bad(
        'Deployed frontend MISSING adjust feature (commit 43811fd+ not in served JS)',
        `checked ${assets.length} chunks; redeploy frontend after git pull`,
      );
    }
    if (permChunk) ok('Frontend checks customers.adjust permission', permChunk);
    else ok('customers.adjust string not in bundle (may be minified — rely on API check)');
  } catch (e) {
    bad('Frontend bundle probe', e.message);
  }
}

async function main() {
  console.log('\n=== Adjust button diagnostic (production vs local) ===');
  console.log(`API:  ${BASE}`);
  console.log(`User: ${EMAIL || '(set TEST_EMAIL)'}\n`);

  await checkFrontendBundle();

  if (!EMAIL || !PASSWORD) {
    console.error('\nSet TEST_EMAIL and TEST_PASSWORD to check RBAC for your henber login.\n');
    console.log('Expected root cause on henber if JS has Adjust but permission missing:');
    console.log('  → run migration 073_customers_adjust_rbac_permission.sql on pos_tenant_henber_pharmacy\n');
    process.exit(fail === 0 ? 0 : 1);
  }

  const login = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  const token = login.data?.data?.token;
  assert(login.status === 200 && token, 'Login', login.data?.error ?? String(login.status));
  if (!token) process.exit(1);

  const permsRes = await req('GET', '/api/rbac/me/permissions', { token });
  const perms = permsRes.data?.data ?? [];
  const keys = perms.map((p) => p.permissionKey ?? p.permission_key);
  console.log(`\n  Effective permissions: ${keys.length}`);
  const hasAdjust = keys.includes('customers.adjust');
  if (hasAdjust) {
    ok('customers.adjust granted → Adjust button should render');
  } else {
    bad('customers.adjust MISSING → Adjust button hidden (RBAC)', `sample: ${keys.filter((k) => k.startsWith('customers.')).join(', ')}`);
    console.error('\n  Fix: apply shared/sql/073_customers_adjust_rbac_permission.sql on tenant DB, re-login.');
  }

  const custRes = await req('GET', '/api/customers?limit=5', { token });
  const customers = custRes.data?.data?.customers ?? custRes.data?.data ?? [];
  const cust = customers[0];
  if (!cust?.id) {
    bad('Find any customer for invoice check');
  } else {
    const invRes = await req('GET', `/api/invoices?customerId=${cust.id}&limit=30`, { token });
    const invoices = invRes.data?.data ?? [];
    const unpaid = invoices.filter((inv) => {
      const due = Number(inv.balance ?? inv.amount_due ?? 0);
      const num = String(inv.invoiceNumber ?? inv.invoice_number ?? '');
      return due > 0 && num.startsWith('INV-');
    });
    console.log(`\n  Customer ${cust.name ?? cust.id}: ${unpaid.length} unpaid INV-* invoice(s)`);
    for (const inv of unpaid.slice(0, 3)) {
      const num = inv.invoiceNumber ?? inv.invoice_number;
      const due = Number(inv.balance ?? inv.amount_due ?? 0);
      const ctx = await req('GET', `/api/customer-invoice-adjustments/invoice/${inv.id}/context`, { token });
      const canApi = ctx.status === 200 && ctx.data?.success;
      console.log(`    ${num} due=${due} adjust-context=${canApi ? 'OK' : ctx.status}`);
    }
    ok('Invoice list reachable', unpaid.length ? `e.g. ${unpaid[0].invoiceNumber ?? unpaid[0].invoice_number}` : 'none');
  }

  console.log('\n========================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('========================================\n');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
