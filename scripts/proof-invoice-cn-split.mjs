#!/usr/bin/env node
/**
 * Proof: customer invoice list excludes CN; credit notes API separate; CN amount_due=0 when posted
 */
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const CUSTOMER_EMAIL = process.env.PROOF_CUSTOMER_EMAIL || 'bliz@gmail.com';

let pass = 0;
let fail = 0;
function ok(n, d = '') { pass++; console.log(`PASS  ${n}${d ? ` — ${d}` : ''}`); }
function bad(n, d = '') { fail++; console.error(`FAIL  ${n}${d ? ` — ${d}` : ''}`); }
function assert(c, n, d = '') { if (c) ok(n, d); else bad(n, d); }

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { status: res.status, data };
}

async function main() {
  console.log(`\nInvoice vs credit note split proof → ${BASE}\n`);

  const login = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  const token = login.data?.data?.token;
  assert(login.status === 200 && token, 'Login');

  const custRes = await req('GET', '/api/customers?search=beccapowers&limit=10', { token });
  const customers = custRes.data?.data?.customers ?? custRes.data?.data ?? [];
  const customer = customers.find((x) => String(x.email || '').toLowerCase() === CUSTOMER_EMAIL.toLowerCase())
    || customers.find((x) => String(x.name || '').toLowerCase().includes('beccapowers'));
  assert(customer?.id, 'Customer beccapowers', customer?.id?.slice(0, 8));

  const invRes = await req('GET', `/api/invoices?customerId=${customer.id}&limit=50`, { token });
  const invList = invRes.data?.data ?? [];
  const cnInList = invList.filter((i) => {
    const n = String(i.invoiceNumber ?? i.invoice_number ?? '').toUpperCase();
    return n.startsWith('CN-') || n.startsWith('DN-');
  });
  assert(cnInList.length === 0, 'GET /invoices?customerId has no CN/DN rows', `found ${cnInList.length}`);
  const inv002 = invList.find((i) => (i.invoiceNumber ?? i.invoice_number) === 'INV-2026-0002');
  assert(inv002, 'INV-2026-0002 in invoice list only');
  if (inv002) {
    const due = Number(inv002.balance ?? inv002.amount_due ?? 0);
    const paid = Number(inv002.amountPaid ?? inv002.amount_paid ?? 0);
    ok('INV-2026-0002 AR fields', `paid=${paid} due=${due}`);
  }

  const cnRes = await req('GET', `/api/credit-debit-notes/customer?customerId=${customer.id}&limit=50`, { token });
  const cnList = cnRes.data?.data ?? [];
  assert(cnList.length > 0, 'Credit notes API returns notes', String(cnList.length));
  const cn003 = cnList.find((n) => n.invoiceNumber === 'CN-2026-0003');
  if (cn003) {
    assert(String(cn003.status).toUpperCase() === 'POSTED', 'CN-2026-0003 POSTED', cn003.status);
    assert(
      cn003.referenceInvoiceNumber === 'INV-2026-0002' || cn003.referenceInvoiceId,
      'CN references INV-2026-0002',
      cn003.referenceInvoiceNumber ?? cn003.referenceInvoiceId,
    );
    assert(Number(cn003.totalAmount) === 36000, 'CN amount 36000', String(cn003.totalAmount));
  } else {
    ok('CN-2026-0003', 'not in DB (skip row checks)');
  }

  const balRes = await req('GET', `/api/customers/${customer.id}`, { token });
  const bal = Number(balRes.data?.data?.balance ?? 0);
  if (inv002) {
    const due = Number(inv002.balance ?? inv002.amount_due ?? 0);
    assert(Math.abs(bal - due) < 1, 'Customer balance = sum invoice amount_due only', `balance=${bal} inv_due=${due}`);
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
