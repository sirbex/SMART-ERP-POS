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
    const htmlRes = await fetch(`${BASE}/`);
    const html = await htmlRes.text();
    const entryAssets = [...html.matchAll(/\/assets\/([^"]+\.js)/g)].map((m) => m[1]);
    const indexFile = entryAssets.find((f) => f.startsWith('index-')) ?? entryAssets[0];
    if (!indexFile) {
      bad('Frontend bundle probe', 'no index chunk in HTML');
      return;
    }
    ok('Served index chunk fingerprint', `${indexFile} (date: ${htmlRes.headers.get('date') || 'unknown'})`);

    const indexJs = await (await fetch(`${BASE}/assets/${indexFile}`)).text();
    const lazyAssets = [
      ...new Set([...indexJs.matchAll(/assets\/([A-Za-z0-9_-]+-[A-Za-z0-9_-]+\.js)/g)].map((m) => m[1])),
    ];
    const customersPageChunk =
      indexJs.match(/CustomersPage-[^"']+\.js/)?.[0] ??
      lazyAssets.find((f) => f.startsWith('CustomersPage-'));
    const apiNeedles = ['customer-invoice-adjustments', '/customer-invoice-adjustments/'];

    let apiChunk = null;
    let permChunk = null;
    for (const file of entryAssets) {
      const js = await (await fetch(`${BASE}/assets/${file}`)).text();
      if (!apiChunk && apiNeedles.some((n) => js.includes(n))) apiChunk = file;
      if (js.includes('customers.adjust')) permChunk = file;
    }
    for (const file of lazyAssets) {
      const js = await (await fetch(`${BASE}/assets/${file}`)).text();
      if (!apiChunk && apiNeedles.some((n) => js.includes(n))) apiChunk = file;
      if (!permChunk && js.includes('customers.adjust')) permChunk = file;
    }

    if (apiChunk) {
      ok('Lazy/entry bundle includes adjust API path', apiChunk);
    } else {
      bad('Adjust API path absent from index + lazy chunks', `lazy chunks scanned: ${lazyAssets.length}`);
    }

    if (customersPageChunk) {
      const cpJs = await (await fetch(`${BASE}/assets/${customersPageChunk}`)).text();
      const hasAdjustLabel = cpJs.includes('Adjust');
      const hasPermGate = cpJs.includes('customers.adjust');
      if (hasAdjustLabel && hasPermGate) {
        ok('CustomersPage chunk has Adjust UI + permission gate', customersPageChunk);
      } else {
        bad('CustomersPage chunk incomplete', `${customersPageChunk} adjust=${hasAdjustLabel} perm=${hasPermGate}`);
      }
    } else {
      bad('CustomersPage lazy chunk not found in index');
    }

    if (permChunk && permChunk !== customersPageChunk) {
      ok('customers.adjust permission string present', permChunk);
    }

    console.log(
      '\n  Note: bundle checks do NOT prove the button appears in the browser (RBAC + invoice eligibility still apply).',
    );
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
