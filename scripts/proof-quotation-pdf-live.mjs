#!/usr/bin/env node
/**
 * Live proof — quotation PDF download on tenant.
 * Usage:
 *   PROD_URL=https://bliss-interior-ltd.wizarddigital-inv.com \
 *   TEST_EMAIL=... TEST_PASSWORD=... \
 *   node scripts/proof-quotation-pdf-live.mjs
 */
const PROD = process.env.PROD_URL || 'https://bliss-interior-ltd.wizarddigital-inv.com';
const EMAIL = process.env.TEST_EMAIL || process.env.BLISS_TEST_EMAIL || '';
const PASS = process.env.TEST_PASSWORD || process.env.BLISS_TEST_PASSWORD || '';

let pass = 0;
let fail = 0;
const ok = (n, d = '') => { pass++; console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`); };
const bad = (n, d = '') => { fail++; console.error(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); };

async function login() {
  const r = await fetch(`${PROD}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  if (!r.ok) throw new Error(`login HTTP ${r.status}`);
  const j = await r.json();
  const token = j.data?.token ?? j.data?.accessToken;
  if (!token) throw new Error('no token');
  return token;
}

console.log(`Tenant: ${PROD}\n`);
if (!EMAIL || !PASS) {
  bad('Credentials', 'Set TEST_EMAIL and TEST_PASSWORD');
  process.exit(1);
}

const token = await login();
ok('Login');
const h = { Authorization: `Bearer ${token}` };

const listRes = await fetch(`${PROD}/api/quotations?limit=5&page=1`, { headers: h });
const listJson = await listRes.json();
const quote = listJson.data?.quotations?.[0] ?? listJson.data?.[0];
if (!quote?.id) {
  bad('Find quotation for PDF test');
  process.exit(1);
}
ok('Find quotation', quote.quoteNumber ?? quote.id);

const pdfRes = await fetch(`${PROD}/api/documents/QUOTATION/${quote.id}`, { headers: h });
const ct = pdfRes.headers.get('content-type') || '';
const cd = pdfRes.headers.get('content-disposition') || '';
const buf = Buffer.from(await pdfRes.arrayBuffer());

if (!pdfRes.ok) {
  bad('PDF HTTP 200', `HTTP ${pdfRes.status}`);
} else {
  ok('PDF HTTP 200');
}

if (!ct.includes('pdf')) bad('Content-Type is PDF', ct);
else ok('Content-Type', ct);

if (!cd.includes('attachment') || !cd.includes('quotation')) bad('Content-Disposition', cd || '(missing)');
else ok('Content-Disposition', cd.slice(0, 80));

if (buf.length < 500) bad('PDF size', `${buf.length} bytes`);
else ok('PDF size', `${buf.length} bytes`);

const head = buf.subarray(0, 5).toString('ascii');
const tail = buf.subarray(Math.max(0, buf.length - 32)).toString('ascii');
if (head !== '%PDF-') bad('PDF header', head);
else ok('PDF header', head);
if (!/%%EOF\s*$/.test(tail)) bad('PDF trailer', tail);
else ok('PDF trailer valid');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
