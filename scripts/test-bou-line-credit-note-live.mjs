#!/usr/bin/env node
/**
 * Live proof — BOU line-level credit note (henber)
 * Run after: node scripts/bou-line-credit-note.mjs --invoice INV-2026-0026 --create
 */
const BASE = process.env.BASE_URL || 'https://henber.wizarddigital-inv.com';
const EMAIL = process.env.TEST_EMAIL || 'admin@test.com';
const PASSWORD = process.env.TEST_PASSWORD || 'VoidOp_2026';
const BOU_ID = '81c0d6d5-d939-4bad-a17b-86728b4b72e4';
const PILOT_INVOICE = 'INV-2026-0026';
const PILOT_CN = 'CN-2026-0002';
const EXPECTED_CN_TOTAL = 81700;
const EXPECTED_LINES = 3;

let passed = 0;
let failed = 0;

function ok(name, detail = '') {
  passed++;
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail = '') {
  failed++;
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}
function assert(cond, name, detail = '') {
  if (cond) ok(name, detail);
  else fail(name, detail);
}

async function request(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  console.log(`\nBOU line-level CN live proof → ${BASE}\n`);

  const login = await request('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  const token = login.data?.data?.token ?? login.data?.data?.accessToken;
  assert(login.status === 200 && token, 'Login');

  const cust = await request('GET', `/api/customers/${BOU_ID}`, { token });
  assert(cust.data?.data?.pricingMode === 'AT_COST', 'BOU pricingMode', cust.data?.data?.pricingMode);

  const invList = await request('GET', `/api/invoices?customerId=${BOU_ID}&limit=50`, { token });
  const inv = (invList.data?.data || []).find(
    (i) => i.invoiceNumber === PILOT_INVOICE || i.invoice_number === PILOT_INVOICE,
  );
  assert(inv?.id, 'Pilot invoice exists', PILOT_INVOICE);

  const saleId = inv.sale_id ?? inv.saleId;
  const sale = await request('GET', `/api/sales/${saleId}`, { token });
  assert(sale.status === 200 && (sale.data?.data?.items?.length ?? 0) >= 3, 'Sale has line items');

  let overLines = 0;
  for (const it of sale.data.data.items) {
    const pr = await request(
      'GET',
      `/api/pricing/price?productId=${it.productId}&customerId=${BOU_ID}&quantity=${it.quantity}`,
      { token },
    );
    const charged = Number(it.unitPrice);
    const correct = Number(pr.data?.data?.finalPrice);
    if (charged > correct + 0.01 && pr.data?.data?.appliedRule?.scope === 'at_cost') overLines++;
  }
  assert(overLines === EXPECTED_LINES, 'Three overcharged at_cost lines', String(overLines));

  const notes = await request('GET', `/api/credit-debit-notes/customer?customerId=${BOU_ID}&limit=20`, { token });
  const cn = (notes.data?.data || []).find(
    (n) => n.invoiceNumber === PILOT_CN || n.invoice_number === PILOT_CN,
  );
  assert(cn?.id, 'Pilot CN exists', PILOT_CN);
  const cnStatus = cn.status ?? cn.Status;
  assert(
    String(cnStatus).toUpperCase() === 'DRAFT',
    'CN still draft (not posted in test)',
    cnStatus,
  );
  const cnTotal = Number(cn.totalAmount ?? cn.total_amount);
  assert(cnTotal === EXPECTED_CN_TOTAL, 'CN total', String(cnTotal));

  const cnDetail = await request('GET', `/api/credit-debit-notes/customer/${cn.id}`, { token });
  const lines = cnDetail.data?.data?.lineItems ?? cnDetail.data?.lineItems ?? [];
  assert(lines.length === EXPECTED_LINES, 'CN line count', String(lines.length));

  const lineSum = lines.reduce((s, l) => s + Number(l.lineTotal ?? l.quantity * l.unitPrice), 0);
  assert(Math.abs(lineSum - EXPECTED_CN_TOTAL) < 0.02, 'CN lines sum to total', String(lineSum));

  const refId =
    cnDetail.data?.data?.note?.referenceInvoiceId ??
    cnDetail.data?.data?.note?.reference_invoice_id ??
    cnDetail.data?.note?.reference_invoice_id;
  assert(refId === inv.id, 'CN references pilot invoice', refId);

  console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
  if (failed) process.exit(1);
  console.log('Line-level CN pilot verified (DRAFT). Post in UI to prove balance impact.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
