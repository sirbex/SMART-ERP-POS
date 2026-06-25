#!/usr/bin/env node
/**
 * Targeted proof for INV-2026-0025 — quote linkage, PDF export, re-convert lock.
 */
import zlib from 'node:zlib';

const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASS = process.env.TEST_PASSWORD || 'admin123';
const TARGET_INV = process.env.TARGET_INVOICE || 'INV-2026-0025';
const TARGET_QUOTE = process.env.TARGET_QUOTE || 'Q-2026-0044';

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

function pdfContains(buf, needle) {
  if (!needle) return false;
  const text = extractPdfText(buf);
  if (text.includes(needle)) return true;
  const compactHay = text.replace(/\s+/g, '');
  const compactNeedle = needle.replace(/\s+/g, '');
  return compactNeedle.length >= 4 && compactHay.includes(compactNeedle);
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

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log(`║  TARGETED PROOF — ${TARGET_INV}                              ║`);
console.log('╚══════════════════════════════════════════════════════════════╝\n');
console.log(`Target: ${BASE}\n`);

const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
});
const token = (await loginRes.json()).data?.token;
if (!token) {
  console.error('Login failed');
  process.exit(1);
}
ok('login');
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

// Find invoice
let invoiceRow = null;
for (let page = 1; page <= 5 && !invoiceRow; page++) {
  const listRes = await fetch(`${BASE}/api/invoices?limit=50&page=${page}`, { headers });
  const listJson = await listRes.json();
  const rows = listJson.data?.invoices ?? listJson.data ?? [];
  invoiceRow = rows.find((r) => (r.invoice_number ?? r.invoiceNumber) === TARGET_INV);
}
await assert(!!invoiceRow, `find invoice ${TARGET_INV}`, invoiceRow?.id?.slice(0, 8));
if (!invoiceRow) process.exit(1);

const detailRes = await fetch(`${BASE}/api/invoices/${invoiceRow.id}`, { headers });
const detailJson = await detailRes.json();
const inv = detailJson.data?.invoice ?? detailJson.data;
const source = detailJson.data?.sourceQuotation;

console.log('\n── INVOICE DB FIELDS ──');
console.log(JSON.stringify({
  invoiceNumber: inv.invoice_number ?? inv.invoiceNumber,
  quote_id: inv.quote_id ?? inv.quoteId ?? null,
  reference: inv.reference ?? null,
  sale_id: inv.sale_id ?? inv.saleId ?? null,
  customer: inv.customer_name ?? inv.customerName,
  total: inv.total_amount ?? inv.totalAmount,
}, null, 2));

console.log('\n── API sourceQuotation ──');
console.log(JSON.stringify(source ?? null, null, 2));

await assert(!!source?.quoteNumber, 'API returns sourceQuotation.quoteNumber', source?.quoteNumber ?? 'MISSING');
await assert(!!source?.referenceDetails?.trim(), 'API returns sourceQuotation.referenceDetails', source?.referenceDetails?.slice(0, 80) ?? 'MISSING');

const pdfRes = await fetch(`${BASE}/api/documents/INVOICE/${invoiceRow.id}`, { headers });
const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
await assert(pdfRes.ok, 'invoice PDF download', String(pdfRes.status));
await assert(pdfContains(pdfBuf, TARGET_INV), 'PDF has invoice number', TARGET_INV);
await assert(pdfContains(pdfBuf, 'Quotation Number'), 'PDF has quotation number row');
await assert(!pdfContains(pdfBuf, 'SOURCE QUOTATION'), 'PDF has no legacy source quotation section');
await assert(pdfContains(pdfBuf, source?.quoteNumber ?? ''), 'PDF has quote number', source?.quoteNumber ?? 'MISSING');

const refLine = (source?.referenceDetails ?? '').split('\n').map((l) => l.trim()).filter(Boolean)[0];
if (refLine) {
  await assert(pdfContains(pdfBuf, refLine), 'PDF has reference line', refLine.slice(0, 60));
}

// Find linked quotation
const quoteId = source?.quoteId ?? inv.quote_id ?? inv.quoteId;
let quote = null;
if (quoteId) {
  const qRes = await fetch(`${BASE}/api/quotations/${quoteId}`, { headers });
  if (qRes.ok) {
    const qJson = await qRes.json();
    quote = qJson.data?.quotation ?? qJson.data;
  }
} else {
  const qSearch = await fetch(`${BASE}/api/quotations?limit=100`, { headers });
  if (qSearch.ok) {
    const rows = (await qSearch.json()).data;
    const list = Array.isArray(rows) ? rows : rows?.quotations ?? [];
    quote = list.find((q) => (q.quoteNumber ?? q.quote_number) === TARGET_QUOTE);
  }
}

console.log('\n── LINKED QUOTATION ──');
if (quote) {
  console.log(JSON.stringify({
    quoteNumber: quote.quoteNumber ?? quote.quote_number,
    status: quote.status,
    reference: quote.reference,
    description: quote.description,
    convertedToSaleId: quote.convertedToSaleId ?? quote.converted_to_sale_id,
    convertedToInvoiceId: quote.convertedToInvoiceId ?? quote.converted_to_invoice_id,
    convertedToInvoiceNumber: quote.convertedToInvoiceNumber ?? quote.converted_to_invoice_number,
  }, null, 2));

  await assert(quote.status === 'CONVERTED', 'quotation status is CONVERTED', quote.status);
  await assert(!!(quote.convertedToSaleId ?? quote.converted_to_sale_id), 'quotation has converted_to_sale_id');
  await assert(
    (quote.convertedToInvoiceNumber ?? quote.converted_to_invoice_number) === TARGET_INV ||
      (quote.convertedToInvoiceId ?? quote.converted_to_invoice_id) === invoiceRow.id,
    'quotation points to this invoice',
    quote.convertedToInvoiceNumber ?? quote.converted_to_invoice_number ?? quote.convertedToInvoiceId,
  );

  console.log('\n── RE-CONVERT MUST FAIL ──');
  const reconvertQuoteId = quoteId ?? quote?.id;
  if (!reconvertQuoteId) {
    bad('re-convert test', 'no quote id');
  } else {
  const convertRes = await fetch(`${BASE}/api/quotations/${reconvertQuoteId}/convert`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ paymentOption: 'none' }),
  });
  const convertBody = await convertRes.text();
  await assert(convertRes.status >= 400, 're-convert rejected (HTTP 4xx)', `${convertRes.status} ${convertBody.slice(0, 120)}`);
  await assert(/already|converted|locked|cannot/i.test(convertBody), 're-convert error mentions already converted', convertBody.slice(0, 120));
  }
} else {
  bad('linked quotation found', quoteId ?? 'no quote id');
}

console.log('\n' + '═'.repeat(64));
console.log(`PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
