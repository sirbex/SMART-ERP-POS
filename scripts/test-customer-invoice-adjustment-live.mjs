#!/usr/bin/env node
/**
 * Live integration test — customer invoice adjustment API + optional post
 *
 * Usage:
 *   node scripts/test-customer-invoice-adjustment-live.mjs
 *   node scripts/test-customer-invoice-adjustment-live.mjs --invoice INV-2026-0026
 *   node scripts/test-customer-invoice-adjustment-live.mjs --invoice INV-2026-0001 --post
 *
 * Local DB: ensure migration 008 applied (SALES_REFUND on AR) for CN GL post.
 *
 * Env:
 *   BASE_URL     default http://localhost:3001
 *   TEST_EMAIL   default admin@samplepos.com
 *   TEST_PASSWORD default admin123
 *   BOU_CUSTOMER_ID optional — find AT_COST overcharge invoice automatically
 */
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const BOU_ID = process.env.BOU_CUSTOMER_ID || '81c0d6d5-d939-4bad-a17b-86728b4b72e4';

const args = process.argv.slice(2);
const invoiceArg =
  args.find((a) => a.startsWith('--invoice='))?.split('=')[1]
  ?? (args.includes('--invoice') ? args[args.indexOf('--invoice') + 1] : null);
const doPost = args.includes('--post');

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, detail = '') {
  passed++;
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail = '') {
  failed++;
  failures.push({ name, detail });
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}
function assert(cond, name, detail = '') {
  if (cond) ok(name, detail);
  else fail(name, detail);
}

async function request(method, path, { token, body } = {}) {
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
    data = { raw: text };
  }
  return { status: res.status, data };
}

async function login() {
  const login = await request('POST', '/api/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  });
  const token =
    login.data?.data?.token
    ?? login.data?.data?.accessToken
    ?? login.data?.token;
  assert(login.status === 200 && token, 'Login', login.data?.error || String(login.status));
  return token;
}

async function findOverchargeInvoice(token, preferredNumber, customerId) {
  const list = await request('GET', `/api/invoices?customerId=${customerId}&limit=50`, { token });
  const rows = list.data?.data ?? [];
  if (preferredNumber) {
    const hit = rows.find(
      (i) => i.invoiceNumber === preferredNumber || i.invoice_number === preferredNumber,
    );
    if (hit) return hit;
  }
  for (const inv of rows) {
    const num = inv.invoiceNumber ?? inv.invoice_number;
    const saleId = inv.sale_id ?? inv.saleId;
    if (!saleId || !num) continue;
    const sale = await request('GET', `/api/sales/${saleId}`, { token });
    if (sale.status !== 200) continue;
    const st = sale.data?.data?.sale?.status ?? sale.data?.sale?.status;
    if (['VOID', 'VOIDED', 'VOIDED_BY_RETURN'].includes(st)) continue;
    const items = sale.data?.data?.items ?? sale.data?.items ?? [];
    let over = 0;
    for (const it of items) {
      const pr = await request(
        'GET',
        `/api/pricing/price?productId=${it.productId}&customerId=${customerId}&quantity=${it.quantity}`,
        { token },
      );
      const charged = Number(it.unitPrice);
      const correct = Number(pr.data?.data?.finalPrice);
      if (charged > correct + 0.01) over++;
    }
    if (over > 0) {
      const ctxProbe = await request(
        'GET',
        `/api/customer-invoice-adjustments/invoice/${inv.id}/context`,
        { token },
      );
      if (ctxProbe.status === 200 && ctxProbe.data?.success && (ctxProbe.data?.data?.overchargeLines?.length ?? 0) > 0) {
        return { ...inv, invoiceNumber: num, _overLines: over };
      }
    }
  }
  return null;
}

/** Scan customers until an invoice has engine-detected overcharge lines */
async function discoverOverchargeInvoice(token, preferredNumber) {
  let hit = await findOverchargeInvoice(token, preferredNumber, BOU_ID);
  if (hit) return { inv: hit, customerId: BOU_ID };

  const custRes = await request('GET', '/api/customers?limit=50', { token });
  const customers = custRes.data?.data?.customers ?? custRes.data?.data ?? [];
  for (const c of customers) {
    const cid = c.id;
    if (!cid || cid === BOU_ID) continue;
    hit = await findOverchargeInvoice(token, preferredNumber, cid);
    if (hit) return { inv: hit, customerId: cid };
  }
  return null;
}

async function main() {
  console.log(`\nCustomer invoice adjustment live test → ${BASE}`);
  console.log(doPost ? 'Mode: context + POST adjust\n' : 'Mode: context only (pass --post to post CN)\n');

  const health = await request('GET', '/health');
  assert(health.status === 200, 'Health', String(health.status));
  if (health.status !== 200) {
    console.error('\nStart server: cd SamplePOS.Server && npm run dev\n');
    process.exit(1);
  }

  const token = await login();
  if (!token) process.exit(1);

  const perms = await request('GET', '/api/rbac/me/permissions', { token });
  const keys = (perms.data?.data ?? perms.data ?? []).map(
    (p) => p.permissionKey ?? p.permission_key ?? p,
  );
  const hasAdjust = keys.includes('customers.adjust') || keys.includes('customers.update');
  assert(
    hasAdjust,
    'User has customers.adjust (or customers.update)',
    hasAdjust ? 'ok' : keys.slice(0, 8).join(', '),
  );

  const discovered = await discoverOverchargeInvoice(token, invoiceArg);
  const inv = discovered?.inv;
  const testCustomerId = discovered?.customerId ?? BOU_ID;
  const invLabel = inv?.invoiceNumber ?? inv?.invoice_number ?? inv?.id;
  assert(inv?.id, 'Found invoice with overcharged lines', invLabel ?? 'none');
  if (!inv?.id) {
    console.error('\nTip: create an AT_COST sale at retail, invoice it, or pass --invoice INV-XXXX.\n');
    process.exit(1);
  }
  ok('Test customer', testCustomerId.slice(0, 8));

  const ctxRes = await request(
    'GET',
    `/api/customer-invoice-adjustments/invoice/${inv.id}/context`,
    { token },
  );
  assert(ctxRes.status === 200 && ctxRes.data?.success, 'GET adjustment context', String(ctxRes.status));
  const ctx = ctxRes.data?.data;
  assert(ctx?.invoice?.id === inv.id, 'Context invoice id');
  assert(Array.isArray(ctx?.overchargeLines), 'Context overchargeLines array');
  assert(ctx.overchargeLines.length > 0, 'At least one overcharge line', String(ctx.overchargeLines.length));
  assert(
    ['PRICE_CORRECTION', 'RETURN_GOODS', 'NONE'].includes(ctx.suggestedIntent),
    'suggestedIntent valid',
    ctx.suggestedIntent,
  );

  const expectedTotal = ctx.overchargeLines.reduce((s, l) => s + l.suggestedLineCredit, 0);
  assert(expectedTotal > 0, 'Expected credit > 0', String(expectedTotal));
  ok('Context total credit', String(expectedTotal));

  if (!doPost) {
    console.log('\n--- Skipping POST (--post not set) ---');
    console.log(`Invoice: ${ctx.invoice.invoiceNumber} · ${ctx.overchargeLines.length} line(s) · ${expectedTotal} UGX credit\n`);
  } else {
    const invBefore = await request('GET', `/api/invoices/${inv.id}`, { token });
    const invRowBefore = invBefore.data?.data?.invoice ?? invBefore.data?.data ?? {};
    const dueBefore = Number(invRowBefore.amount_due ?? invRowBefore.balance ?? 0);

    const adjustRes = await request('POST', '/api/customer-invoice-adjustments/adjust', {
      token,
      body: {
        intent: 'PRICE_CORRECTION',
        invoiceId: inv.id,
        reason: 'Live test — AT_COST price correction',
        notes: 'test-customer-invoice-adjustment-live.mjs',
        lines: ctx.overchargeLines.map((l) => ({ saleItemId: l.saleItemId })),
      },
    });
    assert(adjustRes.status === 201 && adjustRes.data?.success, 'POST adjust', adjustRes.data?.error || String(adjustRes.status));

    const result = adjustRes.data?.data;
    assert(result?.creditNoteNumber, 'Credit note number returned', result?.creditNoteNumber);
    assert(
      Math.abs(Number(result?.totalCredit) - expectedTotal) < 1,
      'Posted credit matches context total',
      `${result?.totalCredit} vs ${expectedTotal}`,
    );

    const cnDetail = await request('GET', `/api/credit-debit-notes/customer/${result.creditNoteId}`, { token });
    const cnStatus = cnDetail.data?.data?.status ?? cnDetail.data?.data?.note?.status;
    assert(
      String(cnStatus).toUpperCase() === 'POSTED',
      'CN status POSTED',
      String(cnStatus),
    );

    const invAfter = await request('GET', `/api/invoices/${inv.id}`, { token });
    const invRowAfter = invAfter.data?.data?.invoice ?? invAfter.data?.data ?? {};
    const dueAfter = Number(invRowAfter.amount_due ?? invRowAfter.balance ?? 0);
    const dueDelta = dueBefore - dueAfter;
    assert(
      Math.abs(dueDelta - expectedTotal) < 1,
      'Invoice amount_due reduced by credit total',
      `due before=${dueBefore} after=${dueAfter} delta=${dueDelta}`,
    );

    const balanceAfter = Number(
      (await request('GET', `/api/customers/${testCustomerId}`, { token })).data?.data?.balance ?? 0,
    );
    assert(
      Math.abs(balanceAfter - dueAfter) < 1,
      'Customer balance matches invoice amount_due (SSOT)',
      `balance=${balanceAfter} due=${dueAfter}`,
    );
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    for (const f of failures) console.error(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
