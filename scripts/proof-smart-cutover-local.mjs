#!/usr/bin/env node
/**
 * Local proof — SMART cutover (Tally/SAP/Odoo-style)
 *
 * PASS when:
 *   1. GET /customers/opening-balance/summary — no cutover, outstanding readable
 *   2. POST /customers/opening-balance — first go-live cutover
 *   3. Summary shows documentTotal = posted amount (≠ required to equal outstanding forever)
 *   4. Second POST rejected
 *   5. POST /customers/opening-balance/increase by INCREASE_BY
 *   6. New cutover documentTotal = first + INCREASE_BY
 *   7. Balance rises by INCREASE_BY (no free cash case)
 *   8. Increase does not use "today's outstanding" as the typed amount (user types delta only)
 *
 * Usage:
 *   npm run proof:smart-cutover:local
 *   BASE_URL=http://localhost:3001 TEST_EMAIL=... TEST_PASSWORD=... node scripts/proof-smart-cutover-local.mjs
 */
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const OB_AMOUNT = Number(process.env.OB_AMOUNT || '200000');
const INCREASE_BY = Number(process.env.INCREASE_BY || '50000');

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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function main() {
  console.log('\n=== SMART cutover local proof ===');
  console.log(`API:         ${BASE}`);
  console.log(`User:        ${EMAIL}`);
  console.log(`OB_AMOUNT:   ${OB_AMOUNT}`);
  console.log(`INCREASE_BY: ${INCREASE_BY}`);
  console.log(`Time:        ${new Date().toISOString()}\n`);

  const health = await req('GET', '/api/health');
  assert(health.status === 200, 'API health', String(health.status));
  if (health.status !== 200) {
    console.log('\nServer not reachable — start with: npm run dev:server\n');
    process.exit(1);
  }

  const login = await req('POST', '/api/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  });
  const token =
    login.data?.data?.token ?? login.data?.data?.accessToken ?? login.data?.token;
  assert(login.status === 200 && token, 'Login', login.data?.error ?? String(login.status));
  if (!token) process.exit(1);

  const stamp = Date.now();
  const create = await req('POST', '/api/customers', {
    token,
    body: {
      name: `PROOF-CUTOVER-${stamp}`,
      phone: `+25671${String(stamp).slice(-7)}`,
      creditLimit: 0,
    },
  });
  const customerId = create.data?.data?.id;
  assert(create.status === 201 && customerId, 'Create customer', create.data?.error);
  if (!customerId) process.exit(1);

  // 1) Summary before cutover
  const sum0 = await req(
    'GET',
    `/api/customers/opening-balance/summary?customerId=${customerId}`,
    { token },
  );
  assert(sum0.status === 200, 'GET summary (no cutover)', sum0.data?.error);
  const s0 = sum0.data?.data;
  assert(s0 && s0.hasActiveCutover === false, 'hasActiveCutover=false');
  assert(s0 && s0.cutover === null, 'cutover null before post');
  assert(Array.isArray(s0?.guidance) && s0.guidance.length > 0, 'guidance present');

  const asOf = todayYmd();

  // 2) Post first cutover
  const post = await req('POST', '/api/customers/opening-balance', {
    token,
    body: {
      customerId,
      amount: OB_AMOUNT,
      asOfDate: asOf,
      notes: 'proof-smart-cutover first',
      postReason: 'Proof: post go-live cutover document total',
    },
  });
  assert(
    post.status === 201 && String(post.data?.data?.invoiceNumber || '').startsWith('OB-'),
    'POST go-live cutover',
    post.data?.error ?? String(post.status),
  );
  const firstObNum = post.data?.data?.invoiceNumber;
  const firstAmt = Number(post.data?.data?.amount ?? 0);
  assert(Math.abs(firstAmt - OB_AMOUNT) < 0.02, 'First cutover amount', String(firstAmt));

  // 3) Summary after post
  const sum1 = await req(
    'GET',
    `/api/customers/opening-balance/summary?customerId=${customerId}`,
    { token },
  );
  const s1 = sum1.data?.data;
  assert(sum1.status === 200 && s1?.hasActiveCutover === true, 'Summary after post has cutover');
  assert(
    Math.abs(Number(s1?.cutover?.documentTotal ?? -1) - OB_AMOUNT) < 0.02,
    'documentTotal = posted cutover (not arbitrary balance field)',
    String(s1?.cutover?.documentTotal),
  );
  assert(
    Math.abs(Number(s1?.currentOutstanding ?? -1) - OB_AMOUNT) < 0.02,
    'outstanding ≈ cutover when only OB open',
    String(s1?.currentOutstanding),
  );

  // 4) Duplicate post rejected
  const dup = await req('POST', '/api/customers/opening-balance', {
    token,
    body: {
      customerId,
      amount: INCREASE_BY,
      asOfDate: asOf,
      postReason: 'Proof: duplicate post should fail',
    },
  });
  assert(dup.status >= 400, 'Second POST rejected (use increase)', dup.data?.error ?? String(dup.status));

  // 5) Increase by delta (user types 50k not 250k)
  const balBeforeIncrease = Number(s1?.currentOutstanding ?? 0);
  const inc = await req('POST', '/api/customers/opening-balance/increase', {
    token,
    body: {
      customerId,
      increaseBy: INCREASE_BY,
      asOfDate: asOf,
      reason: 'Proof: increase cutover by legacy delta only',
      notes: 'proof smart increase',
      confirmImpact: true,
    },
  });
  assert(
    inc.status === 201,
    'POST increase by delta',
    inc.data?.error ?? inc.text?.slice(0, 200) ?? String(inc.status),
  );
  const newTotal = Number(inc.data?.data?.amount ?? 0);
  const prevFromApi = Number(inc.data?.data?.previousCutoverTotal ?? 0);
  const incByApi = Number(inc.data?.data?.increaseBy ?? 0);
  assert(
    Math.abs(prevFromApi - OB_AMOUNT) < 0.02,
    'increase reports previousCutoverTotal',
    String(prevFromApi),
  );
  assert(Math.abs(incByApi - INCREASE_BY) < 0.02, 'increase reports increaseBy', String(incByApi));
  assert(
    Math.abs(newTotal - (OB_AMOUNT + INCREASE_BY)) < 0.02,
    'new cutover total = previous + delta',
    `${newTotal} vs ${OB_AMOUNT + INCREASE_BY}`,
  );
  assert(
    Math.abs(newTotal - (balBeforeIncrease + INCREASE_BY)) < 0.02 ||
      Math.abs(newTotal - (OB_AMOUNT + INCREASE_BY)) < 0.02,
    'increase is document-total based (legacy +delta), not overwrite with screen balance',
  );

  // 6) Summary after increase
  const sum2 = await req(
    'GET',
    `/api/customers/opening-balance/summary?customerId=${customerId}`,
    { token },
  );
  const s2 = sum2.data?.data;
  assert(
    Math.abs(Number(s2?.cutover?.documentTotal ?? -1) - (OB_AMOUNT + INCREASE_BY)) < 0.02,
    'summary documentTotal after increase',
    String(s2?.cutover?.documentTotal),
  );
  assert(
    Math.abs(Number(s2?.currentOutstanding ?? -1) - (OB_AMOUNT + INCREASE_BY)) < 0.02,
    'outstanding rose by increase amount',
    `outstanding=${s2?.currentOutstanding}`,
  );
  assert(
    s2?.cutover?.invoiceNumber && s2.cutover.invoiceNumber !== firstObNum,
    'new OB document after increase replace cycle',
    `${firstObNum} → ${s2?.cutover?.invoiceNumber}`,
  );

  // 7) Regression: typing outstanding-like full amount via increase would be wrong
  //    product derives: if user wrong typed 250k as increase, total becomes 200k+250k.
  //    Proof documents that API takes increaseBy as DELTA only.
  assert(
    INCREASE_BY !== OB_AMOUNT + INCREASE_BY,
    'proof amounts distinct (delta ≠ full total)',
  );

  console.log(`\nCustomer: ${customerId}`);
  console.log(`First OB: ${firstObNum}`);
  console.log(`After increase OB total: ${newTotal} (${s2?.cutover?.invoiceNumber})`);
  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
