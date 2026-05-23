#!/usr/bin/env node
/**
 * Local proof — Customer opening balance (AR cutover / balance brought forward)
 *
 * PASS when:
 *   1. POST /api/customers/opening-balance creates OB- invoice
 *   2. customer.balance increases by posted amount
 *   3. Second post for same customer is rejected (idempotent guard)
 *
 * Requires migration 417_customer_opening_balance.sql on tenant DB.
 *
 * Usage (API on localhost:3001):
 *   npm run proof:customer-ob:local
 *
 *   BASE_URL=http://localhost:3001 TEST_EMAIL=... TEST_PASSWORD=... \
 *     node scripts/proof-customer-opening-balance-local.mjs
 *
 * Reuse customer (skip create):
 *   CUSTOMER_ID=<uuid> npm run proof:customer-ob:local
 */
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const EXISTING_CUSTOMER_ID = process.env.CUSTOMER_ID || '';
const OB_AMOUNT = Number(process.env.OB_AMOUNT || '50000');

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
    data = { raw: text?.slice(0, 600) };
  }
  return { status: res.status, data, text };
}

function todayYmd() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

async function main() {
  console.log('\n=== Customer opening balance local proof ===');
  console.log(`API:    ${BASE}`);
  console.log(`User:   ${EMAIL}`);
  console.log(`Amount: ${OB_AMOUNT}`);
  if (EXISTING_CUSTOMER_ID) console.log(`CUSTOMER_ID: ${EXISTING_CUSTOMER_ID}`);
  console.log(`Time:   ${new Date().toISOString()}\n`);

  const health = await req('GET', '/api/health');
  assert(health.status === 200, 'API health', String(health.status));

  const login = await req('POST', '/api/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  });
  const token = login.data?.data?.token;
  assert(login.status === 200 && token, 'Login', login.data?.error ?? login.text?.slice(0, 120));
  if (!token) {
    console.log(`\n${fail} failed, ${pass} passed\n`);
    process.exit(1);
  }

  let customerId = EXISTING_CUSTOMER_ID;
  let customerName = '';

  if (!customerId) {
    const stamp = Date.now();
    const create = await req('POST', '/api/customers', {
      token,
      body: {
        name: `PROOF-OB-${stamp}`,
        phone: `+256700${String(stamp).slice(-6)}`,
        creditLimit: 0,
      },
    });
    const c = create.data?.data;
    customerId = c?.id;
    customerName = c?.name ?? '';
    assert(create.status === 201 && customerId, 'Create proof customer', create.data?.error ?? String(create.status));
  } else {
    const one = await req('GET', `/api/customers/${customerId}`, { token });
    customerName = one.data?.data?.name ?? customerId;
    assert(one.status === 200, 'Load customer', one.data?.error);
  }

  if (!customerId) {
    console.log(`\n${fail} failed, ${pass} passed\n`);
    process.exit(1);
  }

  const beforeRes = await req('GET', `/api/customers/${customerId}`, { token });
  const balanceBefore = Number(beforeRes.data?.data?.balance ?? 0);
  assert(beforeRes.status === 200, 'Balance before OB', String(balanceBefore));

  const asOf = todayYmd();
  const post = await req('POST', '/api/customers/opening-balance', {
    token,
    body: {
      customerId,
      amount: OB_AMOUNT,
      asOfDate: asOf,
      notes: 'proof-customer-opening-balance-local',
    },
  });
  const obNum = post.data?.data?.invoiceNumber;
  const obId = post.data?.data?.invoiceId;
  const obAmt = Number(post.data?.data?.amount ?? 0);
  assert(
    post.status === 201 && obNum && String(obNum).startsWith('OB-'),
    'POST opening balance',
    post.data?.error ?? post.text?.slice(0, 200) ?? String(post.status),
  );
  assert(Math.abs(obAmt - OB_AMOUNT) < 0.02, 'POST response amount', String(obAmt));
  assert(!!obId, 'POST response invoiceId', obId ?? 'missing');

  const afterRes = await req('GET', `/api/customers/${customerId}`, { token });
  const balanceAfter = Number(afterRes.data?.data?.balance ?? 0);
  const delta = balanceAfter - balanceBefore;
  assert(
    Math.abs(delta - OB_AMOUNT) < 0.02,
    'Balance increased by OB amount',
    `before=${balanceBefore} after=${balanceAfter} delta=${delta}`,
  );

  const invById = await req('GET', `/api/invoices/${obId}`, { token });
  const obInv = invById.data?.data?.invoice ?? invById.data?.data;
  assert(invById.status === 200 && obInv, 'GET OB invoice by id', invById.data?.error);
  if (obInv) {
    assert(
      String(obInv.documentType ?? obInv.document_type) === 'OPENING_BALANCE',
      'document_type OPENING_BALANCE',
      String(obInv.documentType ?? obInv.document_type ?? 'missing'),
    );
    const due = Number(obInv.balance ?? obInv.amountDue ?? obInv.amount_due ?? 0);
    assert(Math.abs(due - OB_AMOUNT) < 0.02, 'OB invoice balance (amount_due)', String(due));
  }

  const invList = await req('GET', `/api/invoices?customerId=${customerId}&limit=20`, { token });
  const invoices = invList.data?.data ?? [];
  assert(
    invoices.some((i) => (i.invoiceNumber ?? i.invoice_number) === obNum),
    'OB invoice in customer invoice list',
    obNum,
  );

  const dup = await req('POST', '/api/customers/opening-balance', {
    token,
    body: { customerId, amount: OB_AMOUNT, asOfDate: asOf },
  });
  assert(
    dup.status >= 400,
    'Duplicate OB rejected',
    dup.data?.error ?? String(dup.status),
  );

  console.log(`\nCustomer: ${customerName} (${customerId})`);
  console.log(`OB doc:   ${obNum}`);
  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
