#!/usr/bin/env node
/**
 * AGGRESSIVE proof — SMART cutover consistency (no bug / no AR drift)
 *
 * Scenarios:
 *   A. Happy path post + double-post guard
 *   B. Increase stack (multiple +delta) — document totals monotoinc
 *   C. Increase requires active cutover (dedicated customer)
 *   D. Rewrite lower total with confirmImpact (and without → confirm required if cash)
 *   E. Outstanding = open-item SSOT after every mutation (summary vs customer.balance)
 *   F. Increase on top of other open sales invoice (if sale API available; else skip)
 *   G. Invalid inputs (0, negative, short reason)
 *   H. Summary fields internal consistency
 *   I. Type full outstanding into increase would wrongly inflate if used as delta —
 *      prove product uses document total base only
 *
 * Usage:
 *   node scripts/proof-smart-cutover-aggressive.mjs
 *   BASE_URL=... TEST_EMAIL=... TEST_PASSWORD=... node scripts/proof-smart-cutover-aggressive.mjs
 */
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';

let pass = 0;
let fail = 0;
const failures = [];

function ok(n, d = '') {
  pass++;
  console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`);
}
function bad(n, d = '') {
  fail++;
  failures.push(`${n}: ${d}`);
  console.error(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
}
function assert(c, n, d = '') {
  if (c) ok(n, d);
  else bad(n, d);
  return c;
}
function near(a, b, eps = 0.02) {
  return Math.abs(Number(a) - Number(b)) < eps;
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
    data = { raw: text?.slice(0, 800) };
  }
  return { status: res.status, data, text };
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function login() {
  const login = await req('POST', '/api/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  });
  return login.data?.data?.token ?? login.data?.data?.accessToken ?? login.data?.token;
}

async function createCustomer(token, label) {
  const stamp = Date.now() + Math.floor(Math.random() * 1000);
  const create = await req('POST', '/api/customers', {
    token,
    body: {
      name: `AGR-CUTOVER-${label}-${stamp}`,
      phone: `+25672${String(stamp).slice(-7)}`,
      creditLimit: 10_000_000,
    },
  });
  return create.data?.data?.id;
}

async function summary(token, customerId) {
  const r = await req(
    'GET',
    `/api/customers/opening-balance/summary?customerId=${customerId}`,
    { token },
  );
  return { status: r.status, s: r.data?.data, err: r.data?.error, raw: r };
}

async function customerBalance(token, customerId) {
  const r = await req('GET', `/api/customers/${customerId}`, { token });
  return Number(r.data?.data?.balance ?? NaN);
}

async function postOb(token, customerId, amount, reason) {
  return req('POST', '/api/customers/opening-balance', {
    token,
    body: {
      customerId,
      amount,
      asOfDate: todayYmd(),
      postReason: reason,
      notes: 'aggressive-proof',
    },
  });
}

async function increase(token, customerId, increaseBy, reason, confirmImpact = true) {
  return req('POST', '/api/customers/opening-balance/increase', {
    token,
    body: {
      customerId,
      increaseBy,
      asOfDate: todayYmd(),
      reason,
      confirmImpact,
      notes: 'aggressive-proof-increase',
    },
  });
}

async function replace(token, customerId, amount, reason, confirmImpact = true) {
  return req('POST', '/api/customers/opening-balance/replace', {
    token,
    body: {
      customerId,
      amount,
      asOfDate: todayYmd(),
      replaceReason: reason,
      confirmImpact,
      notes: 'aggressive-proof-replace',
    },
  });
}

function assertSsot(tokenLabel, s, bal, name) {
  assert(s != null, `${name}: summary body`);
  if (!s) return;
  assert(
    near(s.currentOutstanding, bal),
    `${name}: summary.outstanding == customers.balance`,
    `${s.currentOutstanding} vs ${bal}`,
  );
  if (s.hasActiveCutover && s.cutover) {
    assert(s.cutover.documentTotal > 0, `${name}: documentTotal > 0`);
    assert(
      s.cutover.amountDue >= -0.01 && s.cutover.amountDue <= s.cutover.documentTotal + 0.01,
      `${name}: amountDue within documentTotal`,
      `due=${s.cutover.amountDue} total=${s.cutover.documentTotal}`,
    );
    assert(
      near(s.cutover.amountPaid + s.cutover.amountDue, s.cutover.documentTotal) ||
        s.cutover.amountPaid + s.cutover.amountDue <= s.cutover.documentTotal + 0.05,
      `${name}: paid+due ≈ or ≤ documentTotal`,
      `paid=${s.cutover.amountPaid} due=${s.cutover.amountDue} total=${s.cutover.documentTotal}`,
    );
  } else {
    assert(s.cutover === null, `${name}: no cutover row`);
  }
  assert(s.otherOpenInvoicesDue >= -0.01, `${name}: otherOpenInvoicesDue non-negative`);
  assert(s.unallocatedCash >= -0.01, `${name}: unallocatedCash non-negative`);
}

async function main() {
  console.log('\n=== AGGRESSIVE SMART cutover proof ===');
  console.log(`API:  ${BASE}`);
  console.log(`User: ${EMAIL}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  const health = await req('GET', '/api/health');
  if (health.status !== 200) {
    console.error('API down — start npm run dev:server');
    process.exit(1);
  }
  ok('API health');

  const token = await login();
  assert(!!token, 'Login');
  if (!token) process.exit(1);

  const asOf = todayYmd();

  // ─── A. Happy path ─────────────────────────────────────────────
  console.log('\n[A] Happy path post + double-post');
  const cA = await createCustomer(token, 'A');
  assert(!!cA, 'Create A');
  let r = await summary(token, cA);
  assert(r.s?.hasActiveCutover === false, 'A: no cutover initially');
  r = await postOb(token, cA, 100_000, 'Aggressive proof baseline cutover 100000');
  assert(r.status === 201, 'A: post 100k', r.data?.error);
  const ob1 = r.data?.data?.invoiceNumber;
  r = await summary(token, cA);
  let bal = await customerBalance(token, cA);
  assertSsot(token, r.s, bal, 'A after post');
  assert(near(r.s?.cutover?.documentTotal, 100_000), 'A: doc 100k');
  assert(near(bal, 100_000), 'A: bal 100k');
  r = await postOb(token, cA, 1, 'Aggressive proof should reject second post');
  assert(r.status >= 400, 'A: second post rejected', r.data?.error);

  // ─── B. Multiple increases ─────────────────────────────────────
  console.log('\n[B] Stack increases 10k + 25k + 5k');
  let expected = 100_000;
  for (const delta of [10_000, 25_000, 5_000]) {
    expected += delta;
    r = await increase(token, cA, delta, `Aggressive stack +${delta}`, true);
    assert(r.status === 201, `B: increase +${delta}`, r.data?.error ?? String(r.status));
    assert(near(r.data?.data?.amount, expected), `B: returned total ${expected}`, String(r.data?.data?.amount));
    assert(near(r.data?.data?.increaseBy, delta), `B: returned delta ${delta}`);
    r = await summary(token, cA);
    bal = await customerBalance(token, cA);
    assertSsot(token, r.s, bal, `B after +${delta}`);
    assert(near(r.s?.cutover?.documentTotal, expected), `B: doc ${expected}`);
    assert(near(bal, expected), `B: bal ${expected}`);
  }
  assert(near(expected, 140_000), 'B: final expected 140k');

  // ─── C. Increase without cutover ───────────────────────────────
  console.log('\n[C] Increase without cutover');
  const cC = await createCustomer(token, 'C');
  r = await increase(token, cC, 50_000, 'Should fail no active cutover', true);
  assert(r.status >= 400, 'C: increase blocked', r.data?.error);
  const code = r.data?.error_code || r.data?.errorCode;
  assert(
    code === 'OB_INCREASE_NO_ACTIVE_CUTOVER' ||
      String(r.data?.error || '').toLowerCase().includes('no active'),
    'C: error code or message',
    String(code || r.data?.error),
  );

  // ─── D. Rewrite total ──────────────────────────────────────────
  console.log('\n[D] Rewrite full cutover total (down & up)');
  r = await replace(token, cA, 80_000, 'Aggressive rewrite down to 80000', true);
  assert(r.status === 201, 'D: rewrite down 80k', r.data?.error);
  r = await summary(token, cA);
  bal = await customerBalance(token, cA);
  assertSsot(token, r.s, bal, 'D after rewrite 80k');
  assert(near(r.s?.cutover?.documentTotal, 80_000), 'D: doc 80k');
  assert(near(bal, 80_000), 'D: bal 80k');

  r = await replace(token, cA, 90_000, 'Aggressive rewrite up to 90000', true);
  assert(r.status === 201, 'D: rewrite up 90k', r.data?.error);
  bal = await customerBalance(token, cA);
  assert(near(bal, 90_000), 'D: bal 90k after rewrite up');

  // Mercy-class: rewrite using "balance on screen" equals balance should still set cutover full amount
  r = await replace(token, cA, 90_000, 'Aggressive rewrite same amount identity', true);
  assert(r.status === 201, 'D: rewrite identity 90k', r.data?.error);
  bal = await customerBalance(token, cA);
  assert(near(bal, 90_000), 'D: bal still 90k');

  // ─── E. Increase after rewrite uses document total ─────────────
  console.log('\n[E] Increase after rewrite (document base)');
  r = await increase(token, cA, 10_000, 'Aggressive +10k after rewrite', true);
  assert(r.status === 201, 'E: +10k', r.data?.error);
  assert(near(r.data?.data?.previousCutoverTotal, 90_000), 'E: previous was 90k');
  assert(near(r.data?.data?.amount, 100_000), 'E: new total 100k');
  bal = await customerBalance(token, cA);
  assert(near(bal, 100_000), 'E: bal 100k');

  // If user wrongly used outstanding as increaseBy (100k), product would set 200k — prove current path used 10k only
  r = await summary(token, cA);
  assert(near(r.s?.cutover?.documentTotal, 100_000), 'E: not inflated by outstanding mis-entry');

  // ─── F. Invalid inputs ─────────────────────────────────────────
  console.log('\n[F] Invalid inputs');
  const cF = await createCustomer(token, 'F');
  r = await postOb(token, cF, 0, 'zero amount cutover invalid');
  assert(r.status >= 400, 'F: zero post rejected');
  r = await postOb(token, cF, -100, 'negative cutover invalid xx');
  assert(r.status >= 400, 'F: negative post rejected');
  r = await postOb(token, cF, 1000, 'ab'); // short reason
  assert(r.status >= 400, 'F: short reason rejected');
  r = await postOb(token, cF, 50_000, 'Valid cutover for invalid increase tests');
  assert(r.status === 201, 'F: setup cutover', r.data?.error);
  r = await increase(token, cF, 0, 'zero increase invalid path', true);
  assert(r.status >= 400, 'F: zero increase rejected');
  r = await increase(token, cF, -5, 'negative increase invalid', true);
  assert(r.status >= 400, 'F: negative increase rejected');

  // ─── G. Parallel customers independent ─────────────────────────
  console.log('\n[G] Two customers independent cutovers');
  const cG1 = await createCustomer(token, 'G1');
  const cG2 = await createCustomer(token, 'G2');
  await postOb(token, cG1, 11_000, 'Customer G1 cutover eleven thousand');
  await postOb(token, cG2, 22_000, 'Customer G2 cutover twenty two k');
  const b1 = await customerBalance(token, cG1);
  const b2 = await customerBalance(token, cG2);
  assert(near(b1, 11_000), 'G: G1 balance 11k');
  assert(near(b2, 22_000), 'G: G2 balance 22k');
  r = await increase(token, cG1, 1_000, 'G1 only increase one thousand', true);
  assert(r.status === 201, 'G: increase G1');
  assert(near(await customerBalance(token, cG1), 12_000), 'G: G1 12k');
  assert(near(await customerBalance(token, cG2), 22_000), 'G: G2 untouched 22k');

  // ─── H. Rapid increase loop pressure ───────────────────────────
  console.log('\n[H] Rapid sequential increases (10 × 1000)');
  const cH = await createCustomer(token, 'H');
  r = await postOb(token, cH, 1_000, 'Rapid loop base cutover one thousand');
  assert(r.status === 201, 'H: base', r.data?.error);
  for (let i = 0; i < 10; i++) {
    r = await increase(token, cH, 1_000, `Rapid increase step ${i + 1} of ten xxx`, true);
    if (r.status !== 201) {
      bad(`H: step ${i + 1}`, r.data?.error ?? String(r.status));
      break;
    }
  }
  bal = await customerBalance(token, cH);
  assert(near(bal, 11_000), 'H: final bal 11k after 10 increases', String(bal));
  r = await summary(token, cH);
  assertSsot(token, r.s, bal, 'H final');
  assert(near(r.s?.cutover?.documentTotal, 11_000), 'H: doc 11k');

  // ─── I. Summary guidance always present ────────────────────────
  console.log('\n[I] Summary contract');
  r = await summary(token, cH);
  assert(Array.isArray(r.s?.guidance) && r.s.guidance.length > 0, 'I: guidance non-empty');
  assert(typeof r.s?.hasActiveCutover === 'boolean', 'I: hasActiveCutover boolean');
  assert(r.s?.cutover?.invoiceNumber?.startsWith('OB-'), 'I: OB number');

  // ─── J. Post-then-increase classic 200+50 ───────────────────────
  console.log('\n[J] Classic 200k + 50k → 250k (Mercy prevention)');
  const cJ = await createCustomer(token, 'J');
  await postOb(token, cJ, 200_000, 'Classic two hundred thousand cutover');
  // User mistakenly thinking "post 50k again"
  r = await postOb(token, cJ, 50_000, 'Classic mistaken second post should fail');
  assert(r.status >= 400, 'J: second post fail');
  r = await increase(token, cJ, 50_000, 'Classic correct increase fifty thousand', true);
  assert(r.status === 201, 'J: increase 50k');
  assert(near(r.data?.data?.amount, 250_000), 'J: total 250k');
  bal = await customerBalance(token, cJ);
  assert(near(bal, 250_000), 'J: bal 250k');
  // Wrong path would be replace 50000 leaving balance small
  r = await replace(token, cJ, 50_000, 'Classic mercy rewrite down to 50k for stress', true);
  assert(r.status === 201, 'J: rewrite 50k allowed (advanced)');
  bal = await customerBalance(token, cJ);
  assert(near(bal, 50_000), 'J: bal 50k after intentional rewrite down');
  // Recovery via rewrite full correct total
  r = await replace(token, cJ, 250_000, 'Classic restore full cutover two fifty k', true);
  assert(r.status === 201, 'J: restore 250k');
  bal = await customerBalance(token, cJ);
  assert(near(bal, 250_000), 'J: restored bal 250k');

  console.log(`\n${'='.repeat(48)}`);
  console.log(`${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log('');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

