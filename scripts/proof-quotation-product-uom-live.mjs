#!/usr/bin/env node
/**
 * Live proof — quotation product line MUoM (stock-levels parity) + PDF UoM column.
 *
 * Usage:
 *   PROD_URL=https://bliss-interior-ltd.wizarddigital-inv.com \
 *   TEST_EMAIL=... TEST_PASSWORD=... \
 *   node scripts/proof-quotation-product-uom-live.mjs
 */
import zlib from 'node:zlib';

const PROD = process.env.PROD_URL || 'https://bliss-interior-ltd.wizarddigital-inv.com';
const EMAIL = process.env.TEST_EMAIL || process.env.BLISS_TEST_EMAIL || '';
const PASS = process.env.TEST_PASSWORD || process.env.BLISS_TEST_PASSWORD || '';

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

function displayUom(uom) {
  return (uom.symbol?.trim() || uom.name || '').trim();
}

function pickDefaultUom(uoms) {
  if (!uoms?.length) return null;
  return uoms.find((u) => u.isDefault) || uoms[0];
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  LIVE PROOF — Quotation product MUoM + PDF UoM column       ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
console.log(`Tenant: ${PROD}\n`);

if (!EMAIL || !PASS) {
  bad('Credentials set', 'Set TEST_EMAIL and TEST_PASSWORD');
  process.exit(1);
}

const loginRes = await fetch(`${PROD}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
});
const loginJson = await loginRes.json().catch(() => ({}));
const token = loginJson.data?.token ?? loginJson.data?.accessToken;
assert(!!token, 'POST /api/auth/login', loginRes.ok ? 'token received' : String(loginRes.status));
if (!token) process.exit(1);

const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

console.log('\n1. STOCK LEVELS (catalog uoms[])');
const stockRes = await fetch(`${PROD}/api/inventory/stock-levels`, { headers });
assert(stockRes.ok, 'GET /api/inventory/stock-levels', String(stockRes.status));
const stockJson = stockRes.ok ? await stockRes.json() : null;
const stock = stockJson?.data ?? [];
assert(Array.isArray(stock) && stock.length > 0, 'stock-levels non-empty', `count=${stock.length}`);

const withUoms = stock.find((s) => Array.isArray(s.uoms) && s.uoms.length > 0);
const product = withUoms || stock[0];
assert(!!product?.product_id, 'product with catalog row', product?.product_name?.slice(0, 40));

const uoms = product.uoms?.length
  ? product.uoms
  : [
      {
        uomId: `default-${product.product_id}`,
        name: 'PIECE',
        symbol: 'PIECE',
        conversionFactor: 1,
        isDefault: true,
        price: Number(product.selling_price) || 1000,
      },
    ];
const defaultUom = pickDefaultUom(uoms);
const altUom = uoms.find((u) => u.uomId !== defaultUom.uomId) || defaultUom;
const defaultLabel = displayUom(defaultUom);
const altLabel = displayUom(altUom);
const defaultPrice = Number(defaultUom.price) || Number(product.selling_price) || 1000;
const altPrice = Number(altUom.price) || defaultPrice;

console.log('\n2. CREATE PRODUCT LINE (default selling UoM)');
const validUntil = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const createRes = await fetch(`${PROD}/api/quotations`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    quoteType: 'standard',
    customerName: `Proof product UoM ${Date.now()}`,
    validFrom: new Date().toISOString().slice(0, 10),
    validUntil,
    items: [
      {
        itemType: 'product',
        productId: product.product_id,
        description: product.product_name,
        sku: product.sku,
        quantity: 2,
        unitPrice: defaultPrice,
        isTaxable: product.is_taxable ?? false,
        uomId: defaultUom.uomId.startsWith('default-') ? undefined : defaultUom.uomId,
        uomName: defaultLabel,
      },
    ],
  }),
});
assert(createRes.ok, 'POST /api/quotations (product line)', String(createRes.status));
const created = createRes.ok ? await createRes.json() : null;
const quoteId = created?.data?.quotation?.id ?? created?.data?.id;
const line = created?.data?.items?.[0] ?? created?.data?.quotation?.items?.[0];
assert(!!quoteId, 'quotation id returned', quoteId?.slice(0, 8));
assert(!!line?.uomName?.trim(), 'stored uomName on product line', line?.uomName);
assert(
  String(line?.uomName || '').toLowerCase() === defaultLabel.toLowerCase(),
  'uomName matches catalog default',
  line?.uomName
);

console.log('\n3. UPDATE TO ALT UoM (MUoM conversion price)');
if (altUom.uomId !== defaultUom.uomId) {
  const updateRes = await fetch(`${PROD}/api/quotations/${quoteId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      items: [
        {
          itemType: 'product',
          productId: product.product_id,
          description: product.product_name,
          sku: product.sku,
          quantity: 2,
          unitPrice: altPrice,
          isTaxable: product.is_taxable ?? false,
          uomId: altUom.uomId.startsWith('default-') ? undefined : altUom.uomId,
          uomName: altLabel,
        },
      ],
    }),
  });
  assert(updateRes.ok, 'PUT /api/quotations (alt UoM)', String(updateRes.status));
  const updated = updateRes.ok ? await updateRes.json() : null;
  const uLine = updated?.data?.items?.[0] ?? updated?.data?.quotation?.items?.[0];
  assert(
    String(uLine?.uomName || '').toLowerCase() === altLabel.toLowerCase(),
    'alt uomName persisted',
    uLine?.uomName
  );
} else {
  console.log('  SKIP  single-UoM product — alt conversion test skipped');
}

console.log('\n4. PDF UoM COLUMN');
const pdfRes = await fetch(`${PROD}/api/documents/QUOTATION/${quoteId}`, { headers });
const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
assert(pdfRes.ok, 'GET quotation PDF', String(pdfRes.status));
assert(pdfBuf.subarray(0, 5).toString('ascii') === '%PDF-', 'valid PDF header');

const pdfText = extractPdfText(pdfBuf);
const expectedUom = altUom.uomId !== defaultUom.uomId ? altLabel : defaultLabel;
assert(/UoM/i.test(pdfText), 'PDF table has UoM column header');
assert(
  pdfText.toLowerCase().includes(expectedUom.toLowerCase()),
  'PDF body includes line UoM name',
  expectedUom
);
assert(!/\b2\s+2\b/.test(pdfText.replace(/\s+/g, ' ')), 'Qty column not merged with duplicate qty+uom');

console.log('\n' + '═'.repeat(64));
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail === 0) {
  console.log('✅ LIVE QUOTATION PRODUCT UoM PROOF — ALL PASS');
} else {
  console.log('❌ LIVE QUOTATION PRODUCT UoM PROOF — FAILED');
}
console.log('═'.repeat(64));
process.exit(fail > 0 ? 1 : 0);
