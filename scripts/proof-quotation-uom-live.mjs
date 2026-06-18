#!/usr/bin/env node
/**
 * Live proof — quotation custom line UoM from master list (no duplicate free-text).
 *
 * Usage:
 *   PROD_URL=https://bliss-interior-ltd.wizarddigital-inv.com \
 *   TEST_EMAIL=... TEST_PASSWORD=... \
 *   node scripts/proof-quotation-uom-live.mjs
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD = process.env.PROD_URL || 'https://bliss-interior-ltd.wizarddigital-inv.com';
const EMAIL = process.env.TEST_EMAIL || process.env.BLISS_TEST_EMAIL || '';
const PASS = process.env.TEST_PASSWORD || process.env.BLISS_TEST_PASSWORD || '';

let pass = 0;
let fail = 0;

function ok(name, detail = '') {
  pass += 1;
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function bad(name, detail = '') {
  fail += 1;
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}
function assert(cond, name, detail = '') {
  if (cond) ok(name, detail);
  else bad(name, detail);
}

async function login(base) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  if (!res.ok) return { ok: false, status: res.status, body: await res.text().catch(() => '') };
  const json = await res.json();
  const token = json.data?.token ?? json.data?.accessToken;
  if (!token) return { ok: false, status: res.status, body: 'no token' };
  return { ok: true, token };
}

function displayUom(uom) {
  return (uom.symbol?.trim() || uom.name).trim();
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  LIVE PROOF — Quotation UoM (custom lines)                  ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
console.log(`Tenant: ${PROD}\n`);

if (!EMAIL || !PASS) {
  bad('Credentials set', 'Set TEST_EMAIL and TEST_PASSWORD');
  process.exit(1);
}

const auth = await login(PROD);
assert(auth.ok, 'POST /api/auth/login', auth.ok ? 'token received' : `${auth.status}`);
if (!auth.ok) process.exit(1);

const headers = { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' };

console.log('\n1. MASTER UoM LIST');
const masterRes = await fetch(`${PROD}/api/products/uoms/master`, { headers });
assert(masterRes.ok, 'GET /api/products/uoms/master', String(masterRes.status));
const masterJson = masterRes.ok ? await masterRes.json() : null;
const masterUoms = masterJson?.data ?? [];
assert(Array.isArray(masterUoms) && masterUoms.length > 0, 'master UoM list non-empty', `count=${masterUoms.length}`);

const eachUom =
  masterUoms.find((u) => u.name?.toLowerCase() === 'each') ||
  masterUoms.find((u) => u.symbol?.toLowerCase() === 'ea') ||
  masterUoms[0];
assert(!!eachUom?.id, 'default master UoM resolved', eachUom ? displayUom(eachUom) : 'none');

console.log('\n2. CREATE CUSTOM LINE WITH uomId (canonical)');
const validUntil = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const createById = await fetch(`${PROD}/api/quotations`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    quoteType: 'standard',
    customerName: `Proof UoM ${Date.now()}`,
    validFrom: new Date().toISOString().slice(0, 10),
    validUntil,
    items: [
      {
        itemType: 'custom',
        description: `Proof custom line ${Date.now()}`,
        quantity: 1,
        unitPrice: 1000,
        isTaxable: false,
        uomId: eachUom.id,
        uomName: displayUom(eachUom),
      },
    ],
  }),
});
assert(createById.ok, 'POST /api/quotations (custom + uomId)', String(createById.status));
const createdById = createById.ok ? await createById.json() : null;
const quoteId1 = createdById?.data?.quotation?.id ?? createdById?.data?.id;
const item1 = createdById?.data?.items?.[0] ?? createdById?.data?.quotation?.items?.[0];
assert(item1?.uomId === eachUom.id, 'stored uomId matches master', item1?.uomId?.slice(0, 8));
assert(
  String(item1?.uomName || '').toLowerCase() === displayUom(eachUom).toLowerCase(),
  'stored uomName is canonical',
  item1?.uomName
);

console.log('\n3. CREATE WITH DUPLICATE TEXT ALIAS (Box vs box → same id)');
const boxUom = masterUoms.find((u) => u.name?.toLowerCase() === 'box' || u.symbol?.toLowerCase() === 'box');
if (boxUom) {
  const createAlias = await fetch(`${PROD}/api/quotations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      quoteType: 'standard',
      customerName: `Proof UoM alias ${Date.now()}`,
      validFrom: new Date().toISOString().slice(0, 10),
      validUntil,
      items: [
        {
          itemType: 'custom',
          description: 'Alias UoM line',
          quantity: 2,
          unitPrice: 500,
          isTaxable: false,
          uomName: 'BOX',
        },
      ],
    }),
  });
  assert(createAlias.ok, 'POST /api/quotations (uomName alias BOX)', String(createAlias.status));
  const aliasJson = createAlias.ok ? await createAlias.json() : null;
  const aliasItem = aliasJson?.data?.items?.[0] ?? aliasJson?.data?.quotation?.items?.[0];
  assert(aliasItem?.uomId === boxUom.id, 'alias text resolved to master uomId', aliasItem?.uomId?.slice(0, 8));
  assert(
    String(aliasItem?.uomName || '').toLowerCase() === displayUom(boxUom).toLowerCase(),
    'alias stored canonical uomName',
    aliasItem?.uomName
  );
} else {
  console.log('  SKIP  No Box master UoM on tenant — alias dedup test skipped');
}

console.log('\n4. REJECT UNKNOWN FREE-TEXT UoM');
const rejectRes = await fetch(`${PROD}/api/quotations`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    quoteType: 'standard',
    customerName: `Proof UoM reject ${Date.now()}`,
    validFrom: new Date().toISOString().slice(0, 10),
    validUntil,
    items: [
      {
        itemType: 'custom',
        description: 'Bad UoM line',
        quantity: 1,
        unitPrice: 100,
        isTaxable: false,
        uomName: 'not-a-real-uom-xyz',
      },
    ],
  }),
});
assert(!rejectRes.ok, 'POST rejects unknown custom UoM', String(rejectRes.status));
if (!rejectRes.ok) {
  const errBody = await rejectRes.text();
  assert(/Invalid UoM|system UoM list/i.test(errBody), 'error mentions system UoM list', errBody.slice(0, 120));
}

console.log('\n5. FETCH QUOTE DETAIL');
if (quoteId1) {
  const detail = await fetch(`${PROD}/api/quotations/${quoteId1}`, { headers });
  assert(detail.ok, 'GET /api/quotations/:id', String(detail.status));
  if (detail.ok) {
    const d = await detail.json();
    const line = d.data?.items?.[0];
    assert(line?.uomId === eachUom.id, 'detail uomId persisted', line?.uomName);
  }
}

console.log('\n' + '═'.repeat(64));
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail === 0) {
  console.log('✅ LIVE QUOTATION UoM PROOF — ALL PASS');
} else {
  console.log('❌ LIVE QUOTATION UoM PROOF — FAILED');
}
console.log('═'.repeat(64));
process.exit(fail > 0 ? 1 : 0);
