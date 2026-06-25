#!/usr/bin/env node
/**
 * Proof invoice PDF: Bill To (name, email, phone), separate reference (— when empty),
 * and authorisation names matching API.
 */
import zlib from 'node:zlib';

const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASS = process.env.TEST_PASSWORD || 'admin123';
const TARGET_INV = process.env.TARGET_INVOICE || 'INV-2026-0016';

function extractPdfText(buf) {
  const latin = buf.toString('latin1');
  let text = '';
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = streamRe.exec(latin)) !== null) {
    try {
      const inflated = zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
      const litRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj/g;
      let m;
      while ((m = litRe.exec(inflated)) !== null) text += m[1];
      const tjRe = /\[([^\]]+)\]\s*TJ/g;
      while ((m = tjRe.exec(inflated)) !== null) {
        const hexRe = /<([0-9A-Fa-f]+)>/g;
        let hm;
        while ((hm = hexRe.exec(m[1])) !== null) {
          const hex = hm[1];
          for (let i = 0; i + 1 < hex.length; i += 2) {
            text += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
          }
        }
      }
    } catch {
      // skip
    }
  }
  return text;
}

function sectionBetween(text, startLabel, endLabel) {
  const start = text.indexOf(startLabel);
  if (start < 0) return '';
  const from = start + startLabel.length;
  const end = text.indexOf(endLabel, from);
  return end < 0 ? text.slice(from) : text.slice(from, end);
}

function authSection(text) {
  const start = text.indexOf('AUTHORISATION');
  if (start < 0) return '';
  const terms = text.indexOf('TERMS', start);
  const notes = text.indexOf('NOTES', start);
  let end = text.length;
  if (terms > start) end = Math.min(end, terms);
  if (notes > start) end = Math.min(end, notes);
  return text.slice(start, end);
}

let pass = 0;
let fail = 0;
function ok(n, d = '') {
  pass += 1;
  console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`);
}
function bad(n, d = '') {
  fail += 1;
  console.error(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
}
async function assert(c, n, d = '') {
  if (c) ok(n, d);
  else bad(n, d);
}

async function login() {
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const token = (await loginRes.json()).data?.token;
  if (!token) throw new Error('Login failed');
  return { Authorization: `Bearer ${token}` };
}

async function fetchInvoicePdf(headers, invoiceId) {
  const pdfRes = await fetch(`${BASE}/api/documents/INVOICE/${invoiceId}`, { headers });
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  return { ok: pdfRes.ok, status: pdfRes.status, text: extractPdfText(pdfBuf) };
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  INVOICE PDF — BILL TO + AUTHORISATION PROOF                 ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const headers = await login();
ok('login');

console.log(`\n── ${TARGET_INV} (with reference) ──`);
let invoiceRow = null;
for (let page = 1; page <= 10 && !invoiceRow; page++) {
  const listJson = await (await fetch(`${BASE}/api/invoices?limit=50&page=${page}`, { headers })).json();
  const rows = listJson.data?.invoices ?? listJson.data ?? [];
  invoiceRow = rows.find((r) => (r.invoice_number ?? r.invoiceNumber) === TARGET_INV);
}
await assert(!!invoiceRow, `find ${TARGET_INV}`, invoiceRow?.id?.slice(0, 8));
if (!invoiceRow) process.exit(1);

const detailJson = await (await fetch(`${BASE}/api/invoices/${invoiceRow.id}`, { headers })).json();
const inv = detailJson.data?.invoice ?? detailJson.data;
const source = detailJson.data?.sourceQuotation;
const invoiceAuth = detailJson.data?.invoiceAuthorisedByName ?? null;
const quoteAuth = source?.quotationAuthorisedByName ?? null;

let customerName = inv?.customer_name ?? inv?.customerName ?? null;
let customerEmail = null;
let customerPhone = null;
if (inv?.customer_id) {
  const custRes = await fetch(`${BASE}/api/customers/${inv.customer_id}`, { headers });
  if (custRes.ok) {
    const custJson = await custRes.json();
    const c = custJson.data?.customer ?? custJson.data;
    customerName = customerName ?? c?.name ?? null;
    customerEmail = c?.email ?? null;
    customerPhone = c?.phone ?? null;
  }
}

const { ok: pdfOk, status: pdfStatus, text } = await fetchInvoicePdf(headers, invoiceRow.id);
await assert(pdfOk, 'PDF download', String(pdfStatus));

const billTo = sectionBetween(text, 'BILL TO', 'ITEMS');
const auth = authSection(text);

console.log('\n  Bill To checks');
if (customerName) {
  await assert(billTo.includes(customerName), 'Bill To includes customer name', customerName.slice(0, 40));
  if (source?.reference?.trim()) {
    await assert(
      source.reference.trim() !== customerName.trim(),
      'Reference is not the customer name',
    );
    await assert(billTo.includes(source.reference.trim()), 'Bill To has user reference', source.reference.slice(0, 40));
    const refPos = billTo.indexOf('Reference');
    const namePos = billTo.indexOf(customerName);
    await assert(refPos > namePos, 'Reference row is after name/contact lines');
  }
}
if (customerEmail?.trim()) {
  await assert(billTo.includes(customerEmail.trim()), 'Bill To includes email', customerEmail.slice(0, 40));
}
if (customerPhone?.trim()) {
  await assert(billTo.includes(customerPhone.trim()), 'Bill To includes phone', customerPhone.slice(0, 20));
}
await assert(billTo.includes('Reference'), 'Bill To has Reference label');
await assert(source?.quoteNumber ? text.includes(source.quoteNumber) : true, 'PDF has quotation number', source?.quoteNumber);

console.log('\n  Authorisation checks (API ↔ PDF)');
await assert(text.includes('AUTHORISATION'), 'PDF has Authorisation section');
await assert(text.includes('INVOICE AUTHORISED BY'), 'PDF has Invoice Authorised By label');
if (source) {
  await assert(text.includes('QUOTATION AUTHORISED BY'), 'PDF has Quotation Authorised By label');
}
if (invoiceAuth?.trim()) {
  await assert(auth.includes(invoiceAuth.trim()), 'PDF invoice author matches API', invoiceAuth);
} else {
  await assert(auth.includes('—') || auth.includes('-'), 'PDF shows dash when invoice author missing');
}
if (source) {
  if (quoteAuth?.trim()) {
    await assert(auth.includes(quoteAuth.trim()), 'PDF quotation author matches API', quoteAuth);
  } else {
    await assert(auth.includes('—') || auth.includes('-'), 'PDF shows dash when quotation author missing');
  }
}

console.log('\n── Empty reference invoice ──');
let emptyRefInv = null;
let emptyRefDetail = null;
for (let page = 1; page <= 15 && !emptyRefInv; page++) {
  const listJson = await (await fetch(`${BASE}/api/invoices?limit=50&page=${page}`, { headers })).json();
  const rows = listJson.data?.invoices ?? listJson.data ?? [];
  for (const row of rows) {
    const d = await (await fetch(`${BASE}/api/invoices/${row.id}`, { headers })).json();
    const sq = d.data?.sourceQuotation;
    if (sq && !sq.reference?.trim()) {
      emptyRefInv = row;
      emptyRefDetail = d.data;
      break;
    }
  }
}
if (emptyRefInv) {
  const invNum = emptyRefInv.invoice_number ?? emptyRefInv.invoiceNumber;
  ok('found quote-linked invoice without reference', invNum);
  const { text: emptyText } = await fetchInvoicePdf(headers, emptyRefInv.id);
  const emptyBillTo = sectionBetween(emptyText, 'BILL TO', 'ITEMS');
  await assert(emptyBillTo.includes('Reference'), 'Empty-ref Bill To has Reference label');
  const refIdx = emptyBillTo.indexOf('Reference');
  const afterRef = emptyBillTo.slice(refIdx);
  await assert(afterRef.includes('—') || afterRef.includes('-'), 'Empty reference shows dash in Bill To');
  const sqRef = emptyRefDetail?.sourceQuotation?.reference;
  await assert(!sqRef?.trim(), 'API confirms reference is empty');
} else {
  console.log('  SKIP  no quote-linked invoice with empty reference found in first 750 rows');
}

console.log('\n' + '═'.repeat(64));
console.log(`PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
