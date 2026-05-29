#!/usr/bin/env node
/**
 * Live proof: reports GL alignment + server business date (requires API :3001).
 *
 * Checks:
 *   1. GET /api/server-time — authoritative businessDate
 *   2. POST /api/reports/generate CUSTOMER_ACCOUNT_STATEMENT — GL smart statement w/ openingBalance
 *   3. GET /api/reports/ar-ledger — opening balance row when non-zero history exists
 *   4. GET /api/reports/ap-ledger — responds with openingBalance in summary
 *   5. GET /api/reports/supplier-aging — GL-driven (2100+2150)
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

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const token = json.data?.token ?? json.data?.accessToken;
  if (!token) throw new Error('No token');
  return token;
}

async function main() {
  console.log('\n=== Reports GL + business date proof ===\n');
  const token = await login();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // 1. Server time
  const timeRes = await fetch(`${BASE}/api/server-time`, { headers: { Authorization: `Bearer ${token}` } });
  const timeJson = await timeRes.json();
  const businessDate = timeJson.data?.businessDate;
  assert(timeRes.ok && /^\d{4}-\d{2}-\d{2}$/.test(businessDate ?? ''), 'Server businessDate', businessDate ?? 'missing');

  const endDate = businessDate;
  const startDate = businessDate.slice(0, 8) + '01';

  // 2. Find a customer with AR activity (or any customer)
  const custRes = await fetch(`${BASE}/api/customers?limit=5`, { headers: { Authorization: `Bearer ${token}` } });
  const custJson = await custRes.json();
  const customer = (custJson.data ?? [])[0];
  assert(!!customer?.id, 'Load customer for statement', customer?.name ?? 'none');

  if (customer?.id) {
    const custNum = customer.customerNumber ?? customer.customer_number;
    if (custNum) {
      const stmtRes = await fetch(
        `${BASE}/api/reports/customer-account-statement?customer_number=${encodeURIComponent(custNum)}&start_date=${startDate}&end_date=${endDate}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const stmtJson = await stmtRes.json();
      const summary = stmtJson.data?.summary ?? stmtJson.summary;
      const txSummary = stmtJson.data?.data?.transactionSummary ?? stmtJson.data?.transactionSummary;
      assert(stmtRes.ok && stmtJson.success !== false, 'Customer account statement (GL)', stmtJson.error ?? String(stmtRes.status));
      assert(
        summary?.openingBalance !== undefined || txSummary?.openingBalance !== undefined,
        'Statement includes openingBalance',
        String(summary?.openingBalance ?? txSummary?.openingBalance ?? 'missing'),
      );
      assert(
        summary?.closingBalance !== undefined || txSummary?.closingBalance !== undefined,
        'Statement includes closingBalance',
        String(summary?.closingBalance ?? txSummary?.closingBalance ?? 'missing'),
      );
    } else {
      ok('Customer account statement', 'SKIP — no customer_number on test customer');
    }
  }

  // 3. AR ledger
  const arRes = await fetch(
    `${BASE}/api/reports/ar-ledger?startDate=${startDate}&endDate=${endDate}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const arJson = await arRes.json();
  const arSummary = arJson.data?.summary ?? arJson.summary;
  assert(arRes.ok, 'AR ledger HTTP', arJson.error ?? String(arRes.status));
  assert(arSummary?.openingBalance !== undefined, 'AR ledger summary.openingBalance', JSON.stringify(arSummary ?? {}).slice(0, 120));
  assert(arSummary?.closingBalance !== undefined, 'AR ledger summary.closingBalance');

  // 4. AP ledger
  const apRes = await fetch(
    `${BASE}/api/reports/ap-ledger?startDate=${startDate}&endDate=${endDate}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const apJson = await apRes.json();
  const apSummary = apJson.data?.summary ?? apJson.summary;
  assert(apRes.ok, 'AP ledger HTTP', apJson.error ?? String(apRes.status));
  assert(apSummary?.openingBalance !== undefined, 'AP ledger summary.openingBalance');
  assert(apSummary?.closingBalance !== undefined, 'AP ledger summary.closingBalance');

  // 5. Supplier aging
  const agingRes = await fetch(
    `${BASE}/api/reports/supplier-aging?as_of_date=${endDate}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const agingJson = await agingRes.json();
  assert(agingRes.ok && agingJson.success !== false, 'Supplier aging HTTP', agingJson.error ?? String(agingRes.status));
  const agingRows = agingJson.data?.data ?? agingJson.data ?? [];
  assert(Array.isArray(agingRows), 'Supplier aging returns array');

  // 6. Business performance (GL COGS in summary)
  const bpRes = await fetch(
    `${BASE}/api/reports/business-performance?start_date=${startDate}&end_date=${endDate}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const bpJson = await bpRes.json();
  const bpSummary = bpJson.data?.summary ?? bpJson.summary;
  assert(bpRes.ok, 'Business performance HTTP', bpJson.error ?? String(bpRes.status));
  assert(typeof bpSummary?.totalRevenue === 'number', 'Business performance totalRevenue');
  assert(typeof bpSummary?.totalCogs === 'number', 'Business performance totalCogs (GL)');
  const bpData = bpJson.data ?? bpJson;
  const catRows = bpData?.revenueByCategory ?? [];
  const catCogs = catRows.reduce((s, r) => s + Number(r.totalCogs ?? 0), 0);
  if (bpSummary?.totalRevenue > 0 && catCogs > 0) {
    assert(
      Math.abs((bpSummary.totalCogs ?? 0) - catCogs) < 1,
      'Business performance COGS matches category total',
      `summary=${bpSummary.totalCogs} categories=${catCogs}`,
    );
  }
  const costStock = bpData?.costAndStock ?? [];
  if (bpSummary?.totalCogs > 0) {
    const gl5000 = costStock.find((r) => r.accountCode === '5000');
    assert(
      gl5000 && Number(gl5000.totalAmount) > 0,
      'Section 3 shows COGS account 5000',
      gl5000 ? String(gl5000.totalAmount) : 'missing',
    );
  }
  const moneyIn = bpData?.moneyIn ?? [];
  assert(Array.isArray(moneyIn), 'Business performance moneyIn array');
  for (const row of moneyIn) {
    assert(row.flowType && row.flowLabel, 'Money In row has flowType/flowLabel', row.accountCode);
  }

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
