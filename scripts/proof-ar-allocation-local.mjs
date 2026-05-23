#!/usr/bin/env node
/**
 * Local proof — AR open-item allocation engine
 *
 * PASS when:
 *   1. POST payment FIFO settles open invoice (partial)
 *   2. Customer balance ties to open items − unapplied receipts
 *   3. Unallocated payment + manual partial allocate
 *   4. Overpayment leaves unapplied balance on payment header
 *   5. Reversal restores invoice open balance
 *
 * Usage: npm run proof:ar-allocation:local
 */
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';

let pass = 0;
let fail = 0;
const ok = (n, d = '') => { pass++; console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`); };
const bad = (n, d = '') => { fail++; console.error(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); };
const assert = (c, n, d = '') => (c ? ok(n, d) : bad(n, d));

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
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text?.slice(0, 400) }; }
  return { status: res.status, data, text };
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function main() {
  console.log('\n=== AR allocation local proof ===\n');

  const health = await req('GET', '/api/health');
  assert(health.status === 200, 'API health');

  const login = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  const token = login.data?.data?.token;
  assert(login.status === 200 && token, 'Login');
  if (!token) process.exit(1);

  const stamp = Date.now();
  const cust = await req('POST', '/api/customers', {
    token,
    body: { name: `PROOF-AR-${stamp}`, phone: `+2567${String(stamp).slice(-7)}`, creditLimit: 0 },
  });
  const customerId = cust.data?.data?.id;
  assert(cust.status === 201 && customerId, 'Create customer');

  const ob = await req('POST', '/api/customers/opening-balance', {
    token,
    body: { customerId, amount: 100000, asOfDate: today(), notes: 'proof-ar-allocation' },
  });
  assert(ob.status === 201, 'Opening balance invoice', ob.data?.error);

  const open1 = await req('GET', `/api/ar-payments/customer/${customerId}/open-invoices`, { token });
  const openInvoices = open1.data?.data ?? [];
  assert(open1.status === 200 && openInvoices.length >= 1, 'Open invoices listed', String(openInvoices.length));

  const pay = await req('POST', '/api/ar-payments', {
    token,
    body: {
      customerId,
      amount: 40000,
      paymentDate: today(),
      paymentMethod: 'CASH',
      autoAllocate: true,
      reference: 'proof-fifo-partial',
    },
  });
  const paymentId = pay.data?.data?.payment?.id;
  assert(pay.status === 201 && paymentId, 'POST payment FIFO partial', pay.data?.error);

  const custAfter = await req('GET', `/api/customers/${customerId}`, { token });
  const bal = Number(custAfter.data?.data?.balance ?? -1);
  assert(custAfter.status === 200 && bal === 60000, 'Balance after partial FIFO', String(bal));

  const open2 = await req('GET', `/api/ar-payments/customer/${customerId}/open-invoices`, { token });
  const remaining = (open2.data?.data ?? []).reduce((s, i) => s + Number(i.amountDue), 0);
  assert(remaining === 60000, 'Remaining open computed', String(remaining));

  const detail = await req('GET', `/api/ar-payments/${paymentId}`, { token });
  const allocs = detail.data?.data?.allocations ?? [];
  assert(detail.status === 200 && allocs.length >= 1, 'Payment has allocations', String(allocs.length));

  const pay2 = await req('POST', '/api/ar-payments', {
    token,
    body: {
      customerId,
      amount: 25000,
      paymentDate: today(),
      paymentMethod: 'CASH',
      autoAllocate: false,
      reference: 'proof-unapplied',
    },
  });
  const payment2Id = pay2.data?.data?.payment?.id;
  const unapplied2 = Number(pay2.data?.data?.payment?.unallocatedAmount ?? 0);
  assert(pay2.status === 201 && payment2Id && unapplied2 === 25000, 'Unallocated payment posted', String(unapplied2));

  const invId = open2.data?.data?.[0]?.id;
  const allocManual = await req('POST', `/api/ar-payments/${payment2Id}/allocate`, {
    token,
    body: {
      allocationType: 'MANUAL',
      allocations: [{ invoiceId: invId, amount: 15000 }],
    },
  });
  assert(allocManual.status === 200, 'Manual partial allocate', allocManual.data?.error);

  const pay2After = await req('GET', `/api/ar-payments/${payment2Id}`, { token });
  const unappliedAfter = Number(pay2After.data?.data?.payment?.unallocatedAmount ?? -1);
  assert(unappliedAfter === 10000, 'Unapplied balance after partial manual', String(unappliedAfter));

  const over = await req('POST', '/api/ar-payments', {
    token,
    body: {
      customerId,
      amount: 500000,
      paymentDate: today(),
      paymentMethod: 'CASH',
      autoAllocate: true,
      reference: 'proof-overpay',
    },
  });
  const overUnalloc = Number(over.data?.data?.payment?.unallocatedAmount ?? 0);
  assert(over.status === 201 && overUnalloc > 0, 'Overpayment leaves unapplied credit on receipt', String(overUnalloc));

  const list = await req('GET', `/api/ar-payments?customerId=${customerId}`, { token });
  assert(list.status === 200 && (list.data?.data?.length ?? 0) >= 3, 'List payments for customer', String(list.data?.data?.length));

  if (allocs[0]?.id) {
    const openBeforeRev = await req('GET', `/api/ar-payments/customer/${customerId}/open-invoices`, { token });
    const dueBeforeRev = (openBeforeRev.data?.data ?? []).reduce((s, i) => s + Number(i.amountDue), 0);
    const reversedAmt = Number(allocs[0].amountAllocated ?? 40000);

    const rev = await req('POST', `/api/ar-payments/allocations/${allocs[0].id}/reverse`, { token });
    assert(rev.status === 200, 'Reverse allocation', rev.data?.error);

    const openAfterRev = await req('GET', `/api/ar-payments/customer/${customerId}/open-invoices`, { token });
    const dueAfterRev = (openAfterRev.data?.data ?? []).reduce((s, i) => s + Number(i.amountDue), 0);
    const expectedAfter = dueBeforeRev + reversedAmt;
    assert(
      Math.abs(dueAfterRev - expectedAfter) < 1,
      'Reversal restores invoice open balance',
      `before=${dueBeforeRev} after=${dueAfterRev} expected=${expectedAfter}`,
    );
  }

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
