#!/usr/bin/env node
/**
 * Prove customer invoice adjustment respects prior posted credit notes.
 *
 * Required for INV-2026-0026-style cases: existing CN 81700 + invoice 126300
 * → maxAdditionalCredit must be <= 44600 and line totals must not offer full 82900 again.
 *
 * Usage:
 *   BASE_URL=https://henber.wizarddigital-inv.com TEST_EMAIL=... TEST_PASSWORD=... \
 *     node scripts/proof-invoice-adjust-cap.mjs
 *   node scripts/proof-invoice-adjust-cap.mjs --invoice INV-2026-0026
 */
const BASE = process.env.BASE_URL || 'https://henber.wizarddigital-inv.com';
const EMAIL = process.env.TEST_EMAIL || '';
const PASSWORD = process.env.TEST_PASSWORD || '';
const invoiceArg =
  process.argv.find((a) => a.startsWith('--invoice='))?.split('=')[1]
  ?? (process.argv.includes('--invoice') ? process.argv[process.argv.indexOf('--invoice') + 1] : 'INV-2026-0026');

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
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text?.slice(0, 400) };
  }
  return { status: res.status, data };
}

async function main() {
  console.log('\n=== Invoice adjust cap proof ===');
  console.log(`API:     ${BASE}`);
  console.log(`Invoice: ${invoiceArg}`);
  console.log(`User:    ${EMAIL || '(set TEST_EMAIL / TEST_PASSWORD)'}\n`);

  if (!EMAIL || !PASSWORD) {
    bad('Credentials', 'Set TEST_EMAIL and TEST_PASSWORD for live proof');
    process.exit(1);
  }

  const login = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  const token = login.data?.data?.token;
  assert(login.status === 200 && token, 'Login', login.data?.error ?? String(login.status));
  if (!token) process.exit(1);

  const custRes = await req('GET', '/api/customers?search=BOU&limit=10', { token });
  const customers = custRes.data?.data?.customers ?? custRes.data?.data ?? [];
  const bou = customers.find((c) => String(c.name ?? '').toUpperCase().includes('BOU')) ?? customers[0];
  assert(bou?.id, 'Find BOU customer', bou?.name ?? 'none');
  if (!bou?.id) process.exit(1);

  const invRes = await req('GET', `/api/invoices?customerId=${bou.id}&limit=50`, { token });
  const invoices = invRes.data?.data ?? [];
  const inv = invoices.find(
    (i) => (i.invoiceNumber ?? i.invoice_number) === invoiceArg,
  );
  assert(inv?.id, `Find ${invoiceArg}`, inv ? `id=${inv.id}` : `found ${invoices.length} invoices`);
  if (!inv?.id) process.exit(1);

  const ctxRes = await req('GET', `/api/customer-invoice-adjustments/invoice/${inv.id}/context`, { token });
  const ctx = ctxRes.data?.data;
  assert(ctxRes.status === 200 && ctx, 'GET adjust context', ctxRes.data?.error ?? String(ctxRes.status));
  if (!ctx) process.exit(1);

  const invTotal = Number(ctx.invoice?.totalAmount ?? 0);
  const existing = Number(ctx.existingCreditNoteTotal ?? 0);
  const maxAdd = Number(ctx.maxAdditionalCredit ?? 0);
  const lineSum = (ctx.overchargeLines ?? []).reduce((s, l) => s + Number(l.suggestedLineCredit ?? 0), 0);
  const headroom = Math.max(0, invTotal - existing);

  console.log(`  Invoice total:              ${invTotal}`);
  console.log(`  Existing posted CN total:   ${existing}`);
  console.log(`  Invoice headroom:           ${headroom}`);
  console.log(`  maxAdditionalCredit:        ${maxAdd}`);
  console.log(`  Sum overcharge line credit: ${lineSum}`);

  assert(
    Object.prototype.hasOwnProperty.call(ctx, 'maxAdditionalCredit'),
    'Context exposes maxAdditionalCredit (new API)',
  );
  assert(
    lineSum <= maxAdd + 0.02,
    'Line credits capped by maxAdditionalCredit',
    `lines=${lineSum} max=${maxAdd}`,
  );
  assert(
    maxAdd <= headroom + 0.02,
    'maxAdditionalCredit within invoice headroom',
    `max=${maxAdd} headroom=${headroom}`,
  );

  if (existing >= 81700 - 0.01 && invTotal <= 126300 + 0.01) {
    assert(
      maxAdd <= 44600 + 0.02,
      'INV-2026-0026 scenario: max additional <= 44600',
      `max=${maxAdd}`,
    );
    assert(
      lineSum <= 44600 + 0.02,
      'INV-2026-0026 scenario: offered lines <= 44600',
      `lines=${lineSum}`,
    );
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
