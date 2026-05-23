#!/usr/bin/env node
/**
 * Local proof — Reorder-style PO → submit → send → GR with lines (legacy DB safe)
 *
 * Verifies the flow that failed with:
 *   column "base_qty" / "gri.conversion_factor" does not exist
 *
 * PASS when:
 *   1. PO creates with items
 *   2. Submit + send-to-supplier succeed
 *   3. GET /api/goods-receipts/:id returns items (no SQL column errors)
 *   4. PO still has matching line count
 *
 * Usage (server on localhost:3001):
 *   npm run proof:reorder-po-gr:local
 *
 * Or:
 *   BASE_URL=http://localhost:3001 TEST_EMAIL=... TEST_PASSWORD=... \
 *     node scripts/proof-reorder-po-gr-local.mjs
 *
 * Reuse existing DRAFT PO (skip create):
 *   PO_ID=<uuid> npm run proof:reorder-po-gr:local
 */
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const EXISTING_PO_ID = process.env.PO_ID || '';

let pass = 0;
let fail = 0;

function ok(n, d = '') {
  pass++;
  console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`);
}
function bad(n, d = '') {
  fail++;
  console.error(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
}
function assert(c, n, d = '') {
  if (c) ok(n, d);
  else bad(n, d);
}

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text?.slice(0, 600) };
  }
  return { status: res.status, data, text };
}

function todayYmd() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function futureYmd(days = 14) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

async function main() {
  console.log('\n=== Reorder PO → GR local proof ===');
  console.log(`API:  ${BASE}`);
  console.log(`User: ${EMAIL}`);
  if (EXISTING_PO_ID) console.log(`PO_ID: ${EXISTING_PO_ID} (reuse)`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  const health = await req('GET', '/api/health');
  assert(health.status === 200, 'API health', String(health.status));

  const login = await req('POST', '/api/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  });
  const token = login.data?.data?.token;
  assert(login.status === 200 && token, 'Login', login.data?.error ?? login.text?.slice(0, 120));
  if (!token) {
    console.log(`\n${fail} failed, ${pass} passed\n`);
    process.exit(1);
  }

  const profile = await req('GET', '/api/auth/profile', { token });
  const userId = profile.data?.data?.id || profile.data?.data?.user?.id;
  assert(!!userId, 'Auth profile has user id', profile.data?.error);

  let poId = EXISTING_PO_ID;
  let poNumber = '';

  if (!poId) {
    const suppliers = await req('GET', '/api/suppliers?limit=5', { token });
    const supplierList = suppliers.data?.data?.data ?? suppliers.data?.data ?? [];
    const supplier = Array.isArray(supplierList) ? supplierList[0] : null;
    const supplierId = supplier?.id ?? supplier?.Id;
    assert(!!supplierId, 'Found a supplier', suppliers.data?.error);

    let products = await req(
      'GET',
      `/api/products/procurement-search?q=a&limit=3&supplierId=${encodeURIComponent(supplierId)}`,
      { token }
    );
    let productList = products.data?.data?.data ?? products.data?.data ?? [];
    if (!Array.isArray(productList) || productList.length === 0) {
      products = await req('GET', '/api/products?limit=3&page=1', { token });
      productList = products.data?.data?.data ?? products.data?.data ?? [];
    }
    const product = Array.isArray(productList) ? productList[0] : null;
    const productId = product?.id;
    const productName = product?.name || 'Proof product';
    const unitCost = Number(product?.cost_price ?? product?.costPrice ?? product?.unit_cost ?? 1000) || 1000;
    assert(!!productId, 'Found a product for PO line', products.data?.error);

    const orderDate = todayYmd();
    const expectedDate = futureYmd(14);
    const createPo = await req('POST', '/api/purchase-orders', {
      token,
      body: {
        supplierId,
        orderDate,
        expectedDate,
        notes: 'proof-reorder-po-gr-local',
        createdBy: userId,
        items: [
          {
            productId,
            productName,
            quantity: 2,
            unitCost,
            lineTotal: 2 * unitCost,
            uomId: null,
          },
        ],
      },
    });

    const poPayload = createPo.data?.data;
    poId = poPayload?.po?.id;
    poNumber = poPayload?.po?.po_number ?? poPayload?.po?.poNumber ?? '';
    const poItems = poPayload?.items ?? [];
    assert(createPo.status === 201 || createPo.status === 200, 'Create PO', createPo.data?.error ?? String(createPo.status));
    assert(!!poId, 'PO id returned');
    assert(poItems.length >= 1, 'PO has line items', `lines=${poItems.length}`);
    ok('Created PO', poNumber || poId);
  } else {
    const poGet = await req('GET', `/api/purchase-orders/${poId}`, { token });
    const poPayload = poGet.data?.data;
    poNumber = poPayload?.po?.po_number ?? poPayload?.po?.poNumber ?? poId;
    assert(poGet.status === 200, 'Load existing PO', poGet.data?.error);
    assert((poPayload?.items?.length ?? 0) >= 1, 'Existing PO has items');
  }

  const submit = await req('POST', `/api/purchase-orders/${poId}/submit`, { token });
  assert(
    submit.status === 200 || submit.data?.error?.includes('PENDING'),
    'Submit PO',
    submit.data?.error ?? String(submit.status)
  );

  const send = await req('POST', `/api/purchase-orders/${poId}/send-to-supplier`, { token });
  const sendPayload = send.data?.data;
  const grInfo = sendPayload?.goodsReceipt;
  const grId = grInfo?.id;
  const grNumber = grInfo?.receiptNumber ?? grInfo?.receipt_number;
  assert(
    send.status === 200,
    'Send to supplier (creates GR)',
    send.data?.error ?? send.text?.slice(0, 200)
  );
  assert(!!grId, 'Goods receipt id from send', JSON.stringify(sendPayload)?.slice(0, 200));
  ok('GR draft', grNumber || grId);

  const grDetail = await req('GET', `/api/goods-receipts/${grId}`, { token });
  const grBody = grDetail.data?.data;
  const grItems = grBody?.items ?? [];
  const grStatus = grBody?.gr?.status;
  const poStatus = grBody?.gr?.poStatus ?? grBody?.gr?.po_status;

  assert(grDetail.status === 200, 'GET goods receipt by id (no gri.conversion_factor error)', grDetail.data?.error ?? grDetail.text?.slice(0, 300));
  assert(Array.isArray(grItems), 'GR items is array');
  assert(grItems.length >= 1, 'GR has line items', `lines=${grItems.length}`);
  assert(grStatus === 'DRAFT', 'GR status DRAFT', String(grStatus));
  assert(poStatus === 'PENDING', 'Linked PO still PENDING', String(poStatus));

  if (fail > 0) {
    console.log(`\nFAILED: ${pass} passed, ${fail} failed\n`);
    process.exit(1);
  }

  const first = grItems[0];
  assert(!!(first.productId || first.product_id), 'GR line has productId');
  assert(
    Number(first.orderedQuantity ?? first.ordered_quantity ?? 0) >= 0,
    'GR line has ordered qty',
    String(first.orderedQuantity ?? first.ordered_quantity)
  );
  assert(
    first.conversionFactor !== undefined || first.conversion_factor !== undefined,
    'GR line has conversionFactor (from join, not missing column)',
    'missing'
  );

  const poAfter = await req('GET', `/api/purchase-orders/${poId}`, { token });
  const poLines = poAfter.data?.data?.items ?? [];
  assert(poAfter.status === 200, 'GET PO after send');
  assert(poLines.length >= 1, 'PO still has lines after GR create', `poLines=${poLines.length}`);

  console.log('\n--- Summary ---');
  console.log(`PO:  ${poNumber || poId}`);
  console.log(`GR:  ${grNumber || grId} (${grItems.length} line(s))`);
  console.log(`Sample line: ${first.productName || first.product_name} ordered=${first.orderedQuantity ?? first.ordered_quantity}`);

  console.log(`\n${fail ? 'FAILED' : 'OK'}: ${pass} passed, ${fail} failed\n`);
  console.log(
    fail
      ? 'Fix server errors above, restart API, re-run: npm run proof:reorder-po-gr:local'
      : 'You can open Goods Receipts in the UI and view this GR — lines should appear.'
  );
  console.log(
    '\nOptional: apply migration shared/sql/415_sap_uom_snapshot_columns.sql for full UoM snapshot columns.\n'
  );
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
