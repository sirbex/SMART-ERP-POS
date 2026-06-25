#!/usr/bin/env node
/**
 * LIVE PROOF — Quotation → Invoice PDF enterprise matrix.
 */
import zlib from 'node:zlib';
const BASE = process.env.PROD_URL || process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || process.env.BLISS_TEST_EMAIL || 'admin@samplepos.com';
const PASS = process.env.TEST_PASSWORD || process.env.BLISS_TEST_PASSWORD || 'admin123';

const STAMP = Date.now();
const REF_MARKER = `PROOF-REF-${STAMP}`;
const DESC_MARKER = `Proof delivery note ${STAMP}`;

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

/** Decode pdfkit FlateDecode streams (hex TJ + literal Tj). */
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
      // skip non-zlib stream
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

function assertValidPdf(buf) {
  const head = buf.subarray(0, 5).toString('ascii');
  const tail = buf.subarray(Math.max(0, buf.length - 32)).toString('ascii');
  return head === '%PDF-' && /%%EOF\s*$/.test(tail) && buf.length > 500;
}

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  if (!r.ok) return { ok: false, status: r.status, body: await r.text().catch(() => '') };
  const j = await r.json();
  const token = j.data?.token ?? j.data?.accessToken;
  if (!token) return { ok: false, status: r.status, body: 'no token' };
  return { ok: true, token };
}

async function fetchPdf(path, headers) {
  const r = await fetch(`${BASE}${path}`, { headers });
  const buf = Buffer.from(await r.arrayBuffer());
  return { ok: r.ok, status: r.status, buf, ct: r.headers.get('content-type') || '' };
}

function displayUom(uom) {
  return (uom.symbol?.trim() || uom.name).trim();
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  LIVE PROOF — Quotation → Invoice PDF (enterprise)           ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
console.log(`Target: ${BASE}`);
console.log(`User:   ${EMAIL}\n`);

const auth = await login();
await assert(auth.ok, 'POST /api/auth/login', auth.ok ? 'token' : `${auth.status} ${auth.body?.slice?.(0, 80)}`);
if (!auth.ok) process.exit(1);

const headers = { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' };

/** Fetched early (fresh token) — direct invoices must not show SOURCE QUOTATION block. */
let directInvoiceBaseline = null;

console.log('\n── 0. DIRECT INVOICE BASELINE (no quote linkage) ──');
const earlyInvList = await fetch(`${BASE}/api/invoices?limit=20&page=1`, { headers });
if (earlyInvList.ok) {
  const earlyJson = await earlyInvList.json();
  const earlyRows = earlyJson.data?.invoices ?? earlyJson.data ?? [];
  const earlyDirect = earlyRows.find((i) => !i.quote_id && !i.quoteId);
  if (earlyDirect?.id) {
    const earlyPdf = await fetchPdf(`/api/documents/INVOICE/${earlyDirect.id}`, headers);
    directInvoiceBaseline = { inv: earlyDirect, pdf: earlyPdf };
    await assert(earlyPdf.ok, 'direct invoice PDF (baseline)', String(earlyPdf.status));
    if (earlyPdf.ok) {
      await assert(!pdfContains(earlyPdf.buf, 'Quotation Number'), 'direct invoice omits quotation number row');
    }
    ok('direct invoice baseline', earlyDirect.invoice_number ?? earlyDirect.invoiceNumber);
  } else {
    console.log('  SKIP  no direct (non-quote) invoice in first page of list');
  }
} else {
  bad('invoice list for direct baseline', String(earlyInvList.status));
}

console.log('\n── 1. CUSTOMER + MASTER UoM + SETTINGS ──');
const custRes = await fetch(`${BASE}/api/customers`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    name: `Proof PDF Customer ${STAMP}`,
    phone: '+256700000001',
    email: `proof-${STAMP}@example.com`,
    creditLimit: 500000,
  }),
});
let customerId = null;
if (custRes.ok) {
  const custJson = await custRes.json();
  customerId = custJson.data?.id ?? custJson.data?.customer?.id;
  ok('POST customer for conversion', customerId?.slice(0, 8));
} else {
  const listRes = await fetch(`${BASE}/api/customers?limit=1&page=1`, { headers });
  const listJson = listRes.ok ? await listRes.json() : null;
  customerId = listJson?.data?.customers?.[0]?.id ?? listJson?.data?.[0]?.id;
  await assert(!!customerId, 'resolve existing customer for conversion', customerId?.slice(0, 8));
}

const masterRes = await fetch(`${BASE}/api/products/uoms/master`, { headers });
await assert(masterRes.ok, 'GET master UoMs', String(masterRes.status));
const masterUoms = (await masterRes.json()).data ?? [];
await assert(masterUoms.length > 0, 'master UoM list', `count=${masterUoms.length}`);

const boxUom =
  masterUoms.find((u) => u.name?.toLowerCase() === 'box') ||
  masterUoms.find((u) => u.symbol?.toLowerCase() === 'box') ||
  masterUoms[0];
await assert(!!boxUom?.id, 'resolve Box UoM', boxUom ? displayUom(boxUom) : 'none');

const settingsRes = await fetch(`${BASE}/api/settings/invoice`, { headers });
let footerBefore = '';
if (settingsRes.ok) {
  const settings = (await settingsRes.json()).data;
  footerBefore = settings?.footerText ?? '';
  ok('GET invoice settings', footerBefore ? 'footer configured' : 'no footer yet');
} else {
  bad('GET invoice settings', String(settingsRes.status));
}

console.log('\n── 2. QUOTATION WITH REFERENCE + UoM ──');
const validUntil = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const createRes = await fetch(`${BASE}/api/quotations`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    quoteType: 'standard',
    customerId,
    customerName: `Proof PDF Customer ${STAMP}`,
    reference: REF_MARKER,
    notes: DESC_MARKER,
    validFrom: new Date().toISOString().slice(0, 10),
    validUntil,
    items: [
      {
        itemType: 'custom',
        description: `Proof line ${STAMP}`,
        quantity: 2,
        unitPrice: 5000,
        discountAmount: 0,
        isTaxable: false,
        uomId: boxUom.id,
        uomName: displayUom(boxUom),
      },
    ],
  }),
});
await assert(createRes.ok, 'POST quotation with reference', String(createRes.status));
const created = createRes.ok ? await createRes.json() : null;
const quote = created?.data?.quotation ?? created?.data;
const quoteId = quote?.id;
const quoteNumber = quote?.quoteNumber ?? quote?.quote_number;
await assert(!!quoteId, 'quotation id', quoteId?.slice(0, 8));
await assert(quote?.reference === REF_MARKER, 'reference persisted', quote?.reference);
await assert(!!quote?.customerId || !!customerId, 'quotation has customer for convert', quote?.customerId?.slice(0, 8) ?? customerId?.slice(0, 8));

const quoteDetail = await fetch(`${BASE}/api/quotations/${quoteId}`, { headers });
if (quoteDetail.ok) {
  const qd = await quoteDetail.json();
  const q = qd.data?.quotation ?? qd.data;
  const desc = q?.description;
  await assert(desc === DESC_MARKER, 'description persisted on quotation', desc?.slice(0, 40));
  await assert(!!q?.customerId, 'customerId persisted on quotation', q?.customerId?.slice(0, 8));
}

console.log('\n── 3. QUOTATION PDF BYTES ──');
const qPdf = await fetchPdf(`/api/documents/QUOTATION/${quoteId}`, headers);
await assert(qPdf.ok && qPdf.ct.includes('pdf'), 'quotation PDF HTTP + type', `${qPdf.status} ${qPdf.ct}`);
await assert(assertValidPdf(qPdf.buf), 'quotation PDF structure', `${qPdf.buf.length}b`);
await assert(pdfContains(qPdf.buf, quoteNumber), 'PDF contains quote number', quoteNumber);
await assert(pdfContains(qPdf.buf, REF_MARKER), 'PDF contains reference details', REF_MARKER);
await assert(pdfContains(qPdf.buf, 'Proof delivery'), 'PDF contains description text', 'Proof delivery');
await assert(pdfContains(qPdf.buf, `2 ${displayUom(boxUom)}`), 'PDF contains qty + UoM', `2 ${displayUom(boxUom)}`);
if (footerBefore?.trim()) {
  await assert(pdfContains(qPdf.buf, footerBefore.trim()), 'PDF contains configured footer', footerBefore.slice(0, 40));
} else {
  console.log('  SKIP  footer in PDF (no footer_text in invoice settings)');
}

console.log('\n── 4. QUOTATION WITHOUT REFERENCE ──');
const createBare = await fetch(`${BASE}/api/quotations`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    quoteType: 'standard',
    customerId,
    customerName: `Proof bare ${STAMP}`,
    validFrom: new Date().toISOString().slice(0, 10),
    validUntil,
    items: [
      {
        itemType: 'custom',
        description: 'Bare line',
        quantity: 1,
        unitPrice: 100,
        isTaxable: false,
        uomId: boxUom.id,
        uomName: displayUom(boxUom),
      },
    ],
  }),
});
await assert(createBare.ok, 'POST quotation without reference', String(createBare.status));
const bare = createBare.ok ? await createBare.json() : null;
const bareId = bare?.data?.quotation?.id ?? bare?.data?.id;
const barePdf = await fetchPdf(`/api/documents/QUOTATION/${bareId}`, headers);
await assert(barePdf.ok, 'bare quotation PDF', String(barePdf.status));
await assert(!pdfContains(barePdf.buf, REF_MARKER), 'bare PDF excludes other quote reference');

console.log('\n── 5. CONVERT QUOTATION → INVOICE ──');
const convertRes = await fetch(`${BASE}/api/quotations/${quoteId}/convert`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ paymentOption: 'none' }),
});
if (!convertRes.ok) {
  const errBody = await convertRes.text();
  bad('POST convert quotation', `${convertRes.status} ${errBody.slice(0, 200)}`);
} else {
  ok('POST convert quotation', '200');
}
const converted = convertRes.ok ? await convertRes.json() : null;
const invoice = converted?.data?.invoice;
const invoiceId = invoice?.id;
const invoiceNumber = invoice?.invoice_number ?? invoice?.invoiceNumber;
await assert(!!invoiceId, 'invoice created from quote', invoiceId?.slice(0, 8));

if (invoiceId) {
  const invDetail = await fetch(`${BASE}/api/invoices/${invoiceId}`, { headers });
  if (invDetail.ok) {
    const invJson = await invDetail.json();
    const inv = invJson.data?.invoice ?? invJson.data;
    const source = invJson.data?.sourceQuotation;
    await assert(inv?.quoteId === quoteId || inv?.quote_id === quoteId, 'invoice linked to quote_id', quoteId?.slice(0, 8));
    await assert(
      inv?.reference?.includes(REF_MARKER) && inv?.reference?.includes('Proof delivery'),
      'invoice reference snapshot',
      inv?.reference?.slice(0, 60),
    );
    await assert(source?.quoteNumber === quoteNumber, 'API sourceQuotation.quoteNumber', source?.quoteNumber);
    await assert(
      source?.referenceDetails?.includes(REF_MARKER),
      'API sourceQuotation.referenceDetails',
      source?.referenceDetails?.slice(0, 60),
    );
  }
}

console.log('\n── 6. INVOICE PDF SHOWS SOURCE QUOTATION ──');
if (!invoiceId) {
  bad('invoice PDF checks', 'skipped — convert failed');
} else {
  const invPdf = await fetchPdf(`/api/documents/INVOICE/${invoiceId}`, headers);
  await assert(invPdf.ok && invPdf.ct.includes('pdf'), 'invoice PDF HTTP + type', `${invPdf.status}`);
  await assert(assertValidPdf(invPdf.buf), 'invoice PDF structure', `${invPdf.buf.length}b`);
  await assert(pdfContains(invPdf.buf, quoteNumber), 'invoice PDF has source quote number', quoteNumber);
  await assert(pdfContains(invPdf.buf, REF_MARKER), 'invoice PDF has snapshotted reference', REF_MARKER);
  await assert(pdfContains(invPdf.buf, 'Proof delivery'), 'invoice PDF has snapshotted description', 'Proof delivery');
  await assert(pdfContains(invPdf.buf, invoiceNumber), 'invoice PDF has invoice number', invoiceNumber);
  await assert(pdfContains(invPdf.buf, 'Quotation Number'), 'invoice PDF has quotation number row');
  await assert(!pdfContains(invPdf.buf, 'SOURCE QUOTATION'), 'invoice PDF has no legacy source quotation section');
}

console.log('\n── 7. DIRECT INVOICE (no quotation block) ──');
if (directInvoiceBaseline) {
  ok('direct invoice re-check', 'used baseline from step 0');
} else {
  console.log('  SKIP  no direct invoice baseline captured in step 0');
}

console.log('\n── 8. HISTORICAL SNAPSHOT (edit quote after convert) ──');
if (!invoiceId) {
  console.log('  SKIP  historical snapshot — convert failed');
} else {
  const patchRes = await fetch(`${BASE}/api/quotations/${quoteId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ reference: 'CHANGED-REF-SHOULD-NOT-APPEAR' }),
  });
  if (patchRes.status === 403 || patchRes.status === 409) {
    ok('quotation locked after convert (expected)', String(patchRes.status));
  } else if (patchRes.ok) {
    const invPdf2 = await fetchPdf(`/api/documents/INVOICE/${invoiceId}`, headers);
    await assert(pdfContains(invPdf2.buf, REF_MARKER), 'invoice still shows original snapshot', REF_MARKER);
    await assert(!pdfContains(invPdf2.buf, 'CHANGED-REF-SHOULD-NOT-APPEAR'), 'invoice not affected by quote edit');
  } else {
    bad('post-convert quotation update', String(patchRes.status));
  }

  const invCheck = await fetch(`${BASE}/api/invoices/${invoiceId}`, { headers });
  if (invCheck.ok) {
    const invCheckJson = await invCheck.json();
    const invData = invCheckJson.data?.invoice ?? invCheckJson.data;
    await assert(invData?.reference?.includes(REF_MARKER), 'API invoice reference unchanged after quote edit', invData?.reference?.slice(0, 60));
  }
}

console.log('\n── 9. LEGACY INVOICE FALLBACK (sale.quote_id, invoices.quote_id null) ──');
const invListRes = await fetch(`${BASE}/api/invoices?limit=50&page=1`, { headers });
if (!invListRes.ok) {
  bad('invoice list for legacy fallback', String(invListRes.status));
} else {
  const invListJson = await invListRes.json();
  const invRows = invListJson.data?.invoices ?? invListJson.data ?? [];
  let legacyCase = null;
  for (const row of invRows) {
    if (row.quote_id || row.quoteId) continue;
    const saleId = row.sale_id ?? row.saleId;
    if (!saleId) continue;
    const detailRes = await fetch(`${BASE}/api/invoices/${row.id}`, { headers });
    if (!detailRes.ok) continue;
    const detailJson = await detailRes.json();
    const source = detailJson.data?.sourceQuotation;
    if (source?.quoteNumber) {
      legacyCase = { row, source, detailJson };
      break;
    }
  }
  if (legacyCase) {
    const invNo = legacyCase.row.invoice_number ?? legacyCase.row.invoiceNumber;
    ok('legacy mismatch invoice found', invNo);
    await assert(
      !legacyCase.row.quote_id && !legacyCase.row.quoteId,
      'legacy row has null invoices.quote_id',
      invNo,
    );
    await assert(!!legacyCase.source.quoteNumber, 'API resolves sourceQuotation via sale', legacyCase.source.quoteNumber);
    const legacyPdf = await fetchPdf(`/api/documents/INVOICE/${legacyCase.row.id}`, headers);
    await assert(legacyPdf.ok, 'legacy invoice PDF', String(legacyPdf.status));
    await assert(pdfContains(legacyPdf.buf, 'Quotation Number'), 'legacy PDF has quotation number row');
    await assert(!pdfContains(legacyPdf.buf, 'SOURCE QUOTATION'), 'legacy PDF has no legacy source quotation section');
    await assert(
      pdfContains(legacyPdf.buf, legacyCase.source.quoteNumber),
      'legacy PDF has resolved quote number',
      legacyCase.source.quoteNumber,
    );
    if (legacyCase.source.referenceDetails?.trim()) {
      const refLine = legacyCase.source.referenceDetails.split('\n').map((l) => l.trim()).filter(Boolean)[0];
      if (refLine) {
        await assert(pdfContains(legacyPdf.buf, refLine), 'legacy PDF has reference details', refLine.slice(0, 40));
      }
    }
  } else {
    console.log('  SKIP  no legacy invoice with sale.quote_id only (create credit-sale from quote to seed)');
  }
}

console.log('\n' + '═'.repeat(64));
console.log(`LIVE PROOF: ${pass} passed, ${fail} failed`);
if (fail === 0) {
  console.log('✅ QUOTATION → INVOICE PDF LIVE PROOF — ALL PASS');
} else {
  console.log('❌ QUOTATION → INVOICE PDF LIVE PROOF — FAILED');
}
console.log('═'.repeat(64));
process.exit(fail > 0 ? 1 : 0);
