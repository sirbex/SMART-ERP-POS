#!/usr/bin/env node
/**
 * Prove Sales page cashier aggregation (not line-level rows).
 *
 * PASS when GET /api/sales/reports/by-cashier returns aggregated rows with
 * user_id, cashier_name, total_transactions — not thousands of sale_number lines.
 *
 * Usage:
 *   BASE_URL=http://localhost:3001 TEST_EMAIL=admin@samplepos.com TEST_PASSWORD=admin123 \
 *     node scripts/proof-sales-by-cashier.mjs
 */
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';

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
  console.log('\n=== Sales by cashier aggregation proof ===');
  console.log(`API:  ${BASE}`);
  console.log(`User: ${EMAIL}\n`);

  const login = await req('POST', '/api/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  });
  const token = login.data?.data?.token;
  assert(login.status === 200 && token, 'Login', login.data?.error ?? String(login.status));
  if (!token) {
    console.log(`\n${fail} failed, ${pass} passed\n`);
    process.exit(1);
  }

  const end = new Date().toISOString().slice(0, 10);
  const start = `${end.slice(0, 4)}-01-01`;
  const report = await req('GET', `/api/sales/reports/by-cashier?start_date=${start}&end_date=${end}`, {
    token,
  });
  assert(report.status === 200 && report.data?.success, 'by-cashier HTTP 200', String(report.status));

  const rows = Array.isArray(report.data?.data) ? report.data.data : [];
  assert(rows.length > 0, 'Has cashier rows', `count=${rows.length}`);
  assert(rows.length < 500, 'Row count is aggregated (not line-level)', `count=${rows.length}`);

  const first = rows[0] || {};
  assert('user_id' in first, 'Row has user_id');
  assert('cashier_name' in first, 'Row has cashier_name');
  assert('total_transactions' in first, 'Row has total_transactions');
  assert('total_revenue' in first, 'Row has total_revenue');
  assert(!('sale_number' in first), 'Row is not line-level (no sale_number)');

  const unknownOnly =
    rows.length > 0 &&
    rows.every(
      (r) =>
        !r.cashier_name ||
        String(r.cashier_name) === 'Unknown User' ||
        Number(r.total_transactions || 0) === 0
    );
  assert(!unknownOnly, 'Not all rows Unknown User / zero sales');

  const named = rows.filter((r) => r.cashier_name && Number(r.total_transactions) > 0);
  if (named.length > 0) {
    ok('Sample cashier', `${named[0].cashier_name}: ${named[0].total_transactions} sales`);
  }

  console.log(`\n${fail ? 'FAILED' : 'OK'}: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
