#!/usr/bin/env node
/** Live proof: quotation PDF reference — user text in header/body, quote number fallback when empty. */
import zlib from 'node:zlib';

const PROD = process.env.PROD_URL || 'https://bliss-interior-ltd.wizarddigital-inv.com';
const EMAIL = process.env.TEST_EMAIL || 'ksnzeyi@gmail.com';
const PASS = process.env.TEST_PASSWORD || 'Bliss2520';

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

let pass = 0;
let fail = 0;
const ok = (n, d = '') => { pass++; console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`); };
const bad = (n, d = '') => { fail++; console.error(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); };

const loginRes = await fetch(`${PROD}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
});
const token = (await loginRes.json()).data?.token;
if (!token) {
  bad('login', String(loginRes.status));
  process.exit(1);
}
ok('login');

const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const validUntil = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const validFrom = new Date().toISOString().slice(0, 10);

async function createQuote(reference) {
  const res = await fetch(`${PROD}/api/quotations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      quoteType: 'standard',
      customerName: `Ref proof ${Date.now()}`,
      reference,
      validFrom,
      validUntil,
      items: [{
        itemType: 'custom',
        description: 'Proof line',
        quantity: 1,
        unitPrice: 100,
        isTaxable: false,
        uomName: 'EA',
      }],
    }),
  });
  const json = await res.json();
  const quote = json.data?.quotation ?? json.data;
  const pdfBuf = Buffer.from(await (await fetch(`${PROD}/api/documents/QUOTATION/${quote.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })).arrayBuffer());
  return { quote, text: extractPdfText(pdfBuf) };
}

console.log('\n1. NO USER REFERENCE — header + Reference row use quote number');
const empty = await createQuote(undefined);
if (empty.text.includes(empty.quote.quoteNumber)) ok('header/body shows quote number', empty.quote.quoteNumber);
else bad('header/body shows quote number', empty.quote.quoteNumber);

console.log('\n2. USER REFERENCE — header + Reference row show user text');
const userRef = `PO-PROOF-${Date.now()}`;
const withRef = await createQuote(userRef);
if (withRef.text.includes(userRef)) ok('PDF shows user reference in header/body', userRef);
else bad('PDF shows user reference in header/body', userRef);
if (withRef.text.includes(withRef.quote.quoteNumber)) ok('system quote number still present in meta', withRef.quote.quoteNumber);
else bad('system quote number still present in meta', withRef.quote.quoteNumber);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
