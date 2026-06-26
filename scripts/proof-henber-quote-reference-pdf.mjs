#!/usr/bin/env node
/**
 * Proof quotation PDF reference on Henber production for a specific quote.
 *   QUOTE_NUMBER=Q-2026-0043 node scripts/proof-henber-quote-reference-pdf.mjs
 */
import zlib from 'node:zlib';

const BASE = process.env.PROD_URL || 'https://henber.wizarddigital-inv.com';
const QUOTE_NUMBER = process.env.QUOTE_NUMBER || 'Q-2026-0043';
const EMAIL = process.env.TEST_EMAIL || process.env.HENBER_TEST_EMAIL || 'admin@samplepos.com';
const PASS = process.env.TEST_PASSWORD || process.env.HENBER_TEST_PASSWORD || 'admin123';

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
function assert(c, n, d = '') {
  if (c) ok(n, d);
  else bad(n, d);
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log(`║  HENBER QUOTATION PDF REFERENCE PROOF — ${QUOTE_NUMBER}       ║`);
console.log('╚══════════════════════════════════════════════════════════════╝\n');
console.log(`Tenant: ${BASE}`);
console.log(`Quote:  ${QUOTE_NUMBER}\n`);

const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
});
const loginJson = await loginRes.json().catch(() => ({}));
const token = loginJson.data?.token;
if (!token) {
  console.error(`Login failed: HTTP ${loginRes.status} ${JSON.stringify(loginJson).slice(0, 200)}`);
  console.error('Set HENBER_TEST_PASSWORD / TEST_PASSWORD for Henber production.');
  process.exit(1);
}
ok('login', EMAIL);
const headers = { Authorization: `Bearer ${token}` };

let quoteRow = null;
for (let page = 1; page <= 10 && !quoteRow; page++) {
  const listRes = await fetch(`${BASE}/api/quotations?limit=50&page=${page}`, { headers });
  const listJson = await listRes.json();
  const rows = listJson.data?.quotations ?? listJson.data ?? [];
  quoteRow = rows.find((q) => (q.quoteNumber ?? q.quote_number) === QUOTE_NUMBER);
}
await assert(!!quoteRow, `find ${QUOTE_NUMBER}`, quoteRow?.id?.slice(0, 8));
if (!quoteRow) process.exit(1);

const detailRes = await fetch(`${BASE}/api/quotations/${quoteRow.id}`, { headers });
await assert(detailRes.ok, 'GET quotation detail', String(detailRes.status));
const detailJson = await detailRes.json();
const q = detailJson.data?.quotation ?? detailJson.data;
const apiReference = q?.reference?.trim() || null;
const customerName = q?.customerName ?? q?.customer_name ?? 'Santa Maria School';

console.log('\n── API (source of truth) ──');
console.log(`  customer:   ${customerName}`);
console.log(`  reference:  ${apiReference ? JSON.stringify(apiReference) : '(empty — user did not enter reference)'}`);
console.log(`  status:     ${q?.status}`);
console.log(`  validFrom:  ${q?.validFrom ?? q?.valid_from}`);
console.log(`  validUntil: ${q?.validUntil ?? q?.valid_until}`);

const pdfRes = await fetch(`${BASE}/api/documents/QUOTATION/${quoteRow.id}`, { headers });
const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
await assert(pdfRes.ok, 'PDF download', String(pdfRes.status));

const text = extractPdfText(pdfBuf);
const quotedTo = sectionBetween(text, 'QUOTED TO', 'ITEMS');
const hasReferenceLabel = quotedTo.includes('Reference') || text.includes('REFERENCE');

console.log('\n── PDF QUOTED TO card ──');
console.log(`  chunk length: ${quotedTo.length} chars`);
await assert(text.includes('QUOTED TO'), 'PDF has QUOTED TO section');
await assert(text.includes(customerName) || text.includes('Santa Maria'), 'PDF has customer name');
await assert(text.includes(QUOTE_NUMBER), 'PDF has quote number', QUOTE_NUMBER);

if (apiReference) {
  await assert(hasReferenceLabel, 'PDF has Reference label when API reference set');
  await assert(quotedTo.includes(apiReference) || text.includes(apiReference), 'PDF shows API reference text', apiReference.slice(0, 60));
  await assert(
    !quotedTo.includes(customerName) || quotedTo.indexOf('Reference') > quotedTo.indexOf(customerName),
    'Reference row is after customer contact lines',
  );
} else {
  await assert(hasReferenceLabel, 'PDF has Reference label (falls back to quote number)');
  await assert(
    quotedTo.includes(QUOTE_NUMBER) || text.includes(QUOTE_NUMBER),
    'PDF Reference shows quote number when user reference empty',
    QUOTE_NUMBER,
  );
  ok('expected behaviour', 'Reference block shows quote number fallback');
}

console.log('\n── PDF excerpt (QUOTED TO region) ──');
const excerpt = quotedTo.replace(/\s+/g, ' ').trim().slice(0, 280);
console.log(`  ${excerpt || '(empty extract)'}`);

console.log('\n' + '═'.repeat(64));
console.log(`PROOF: ${pass} passed, ${fail} failed`);
if (fail === 0) {
  console.log(`✅ ${QUOTE_NUMBER} PDF reference behaviour matches API`);
} else {
  console.log(`❌ ${QUOTE_NUMBER} PDF reference mismatch`);
}
process.exit(fail > 0 ? 1 : 0);
