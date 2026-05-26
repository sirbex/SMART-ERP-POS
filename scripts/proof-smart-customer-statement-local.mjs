#!/usr/bin/env node
/**
 * Live proof: customer smart-statement API (requires local API :3001).
 * Catches PostgreSQL uuid/text parameter bugs before UI testing.
 */
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const SEARCH = process.env.CUSTOMER_SEARCH || 'becca';

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const token = json.data?.token ?? json.data?.accessToken;
  if (!token) throw new Error('No token in login response');
  return token;
}

async function main() {
  const token = await login();
  const searchRes = await fetch(`${BASE}/api/customers/search?q=${encodeURIComponent(SEARCH)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!searchRes.ok) throw new Error(`Customer search failed ${searchRes.status}`);
  const searchJson = await searchRes.json();
  const customer = searchJson.data?.[0];
  if (!customer?.id) throw new Error(`No customer found for search "${SEARCH}"`);

  const end = new Date().toISOString().slice(0, 10);
  const startD = new Date();
  startD.setUTCDate(startD.getUTCDate() - 90);
  const start = startD.toISOString().slice(0, 10);

  const url = `${BASE}/api/customers/${customer.id}/smart-statement?startDate=${start}&endDate=${end}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.text();
  if (!res.ok) {
    console.error('FAIL HTTP', res.status, body.slice(0, 1500));
    process.exit(1);
  }
  const json = JSON.parse(body);
  if (!json.success || !json.data) {
    console.error('FAIL response', body.slice(0, 1500));
    process.exit(1);
  }
  console.log(
    `PASS smart-statement ${customer.name} entries=${json.data.entries?.length ?? 0} closing=${json.data.closingBalance}`,
  );
}

main().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
