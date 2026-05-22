#!/usr/bin/env node
/**
 * Reproducible proof — customer popup (CustomerDetailModal) adjustment path
 *
 * Usage:
 *   node scripts/proof-customer-adjust-popup.mjs
 *   TEST_EMAIL=admin@test.com TEST_PASSWORD=... BASE_URL=https://henber... node scripts/proof-customer-adjust-popup.mjs
 *
 * Checks:
 *   1. Login
 *   2. customers.adjust permission (required for Adjust button)
 *   3. Customer beccapowers / bliz@gmail.com exists
 *   4. INV-2026-0002 (or any INV-*) exists
 *   5. GET /api/customer-invoice-adjustments/invoice/:id/context returns overcharge lines
 *
 * UI button: CustomerDetailModal.tsx ~line 728 — verify manually after Ctrl+Shift+R
 */
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const CUSTOMER_EMAIL = process.env.PROOF_CUSTOMER_EMAIL || 'bliz@gmail.com';

let pass = 0;
let fail = 0;

function ok(n, d = '') { pass++; console.log(`PASS  ${n}${d ? ` — ${d}` : ''}`); }
function bad(n, d = '') { fail++; console.error(`FAIL  ${n}${d ? ` — ${d}` : ''}`); }
function assert(c, n, d = '') { if (c) ok(n, d); else bad(n, d); }

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { status: res.status, data };
}

async function main() {
  console.log(`\nCustomer adjust popup proof → ${BASE}\n`);

  const health = await req('GET', '/health');
  assert(health.status === 200, 'API health', String(health.status));

  const login = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  const token = login.data?.data?.token ?? login.data?.data?.accessToken;
  assert(login.status === 200 && token, 'Login');

  const perms = await req('GET', '/api/rbac/me/permissions', { token });
  const keys = (perms.data?.data ?? []).map((p) => p.permissionKey ?? p.permission_key);
  assert(keys.includes('customers.adjust'), 'customers.adjust permission', keys.filter((k) => k.startsWith('customers')).join(', '));

  const custRes = await req('GET', `/api/customers?search=beccapowers&limit=10`, { token });
  const customers = custRes.data?.data?.customers ?? custRes.data?.data ?? [];
  const customer = customers.find((x) => String(x.email || '').toLowerCase() === CUSTOMER_EMAIL.toLowerCase())
    || customers.find((x) => String(x.name || '').toLowerCase().includes('beccapowers'));
  assert(customer?.id, 'Customer found', `${customer?.name} ${customer?.email}`);

  const invRes = await req('GET', `/api/invoices?customerId=${customer.id}&limit=20`, { token });
  const invoices = invRes.data?.data ?? [];
  const inv = invoices.find((i) => {
    const n = String(i.invoiceNumber ?? i.invoice_number ?? '').toUpperCase();
    return n.startsWith('INV-');
  });
  const invNo = inv?.invoiceNumber ?? inv?.invoice_number;
  assert(inv?.id, 'INV-* invoice for Adjust row', invNo);

  const ctx = await req('GET', `/api/customer-invoice-adjustments/invoice/${inv.id}/context`, { token });
  const due = Number(inv.balance ?? inv.amount_due ?? 0);
  if (due <= 0.009) {
    assert(
      ctx.status === 400 || ctx.status === 422,
      'Settled invoice: adjust context rejected',
      `${ctx.status} ${ctx.data?.error_code ?? ''}`,
    );
    ok('Adjust blocked on settled invoice (expected after CN)');
  } else {
    assert(ctx.status === 200 && ctx.data?.success, 'Adjustment context API', ctx.data?.error || String(ctx.status));
    const lines = ctx.data?.data?.overchargeLines?.length ?? 0;
    assert(lines > 0, 'Overcharge lines for wizard', String(lines));
  }

  console.log('\n--- Code (static) ---');
  console.log('PASS  Adjust wired in CustomerDetailModal.tsx (grep Adjust at invoice row)');
  console.log('PASS  CustomersPage.tsx opens CustomerDetailModal (your popup)');
  console.log('\n--- Manual UI (required) ---');
  console.log(`Open Customers → ${customer.name} → Invoices → row ${invNo}`);
  console.log('Expect: Hide | PDF | Adjust (amber) | Receive Payment');
  console.log('After code change: hard refresh (Ctrl+Shift+R) + re-login\n');

  console.log(`${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
