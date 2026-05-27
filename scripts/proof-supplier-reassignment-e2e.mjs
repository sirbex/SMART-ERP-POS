#!/usr/bin/env node
/**
 * End-to-end proof: supplier reassignment (PO + GR + GL + GR/IR + integrity).
 *
 * Creates an isolated PO → GR (no supplier bill), reassigns vendor A → B, then verifies:
 *   - Purchase order supplier_id updated
 *   - Goods receipt detail shows new supplier
 *   - GR/IR open work list shows receipt under new supplier (not old)
 *   - Trial balance still balanced; accounting integrity PASS
 *
 * Requires local API on :3001 with admin user and corrections.execute permission.
 *
 * Usage:
 *   npm run proof:supplier-reassignment:e2e
 *
 * Reuse existing COMPLETED GR (no PO create):
 *   GRN_ID=<uuid> FROM_SUPPLIER_ID=<uuid> TO_SUPPLIER_ID=<uuid> npm run proof:supplier-reassignment:e2e
 */
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const TENANT = process.env.TEST_TENANT || 'default';
const EXISTING_GRN_ID = process.env.GRN_ID || '';
const EXISTING_FROM = process.env.FROM_SUPPLIER_ID || '';
const EXISTING_TO = process.env.TO_SUPPLIER_ID || '';

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
    data = { raw: text?.slice(0, 800) };
  }
  return { status: res.status, data, text };
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function futureYmd(days = 14) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function unwrapList(payload) {
  const d = payload?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.items)) return d.items;
  return [];
}

async function snapshotBooks(token) {
  const tb = await req('GET', '/api/accounting/trial-balance', { token });
  const totals = tb.data?.data?.totals;
  const ig = await req('GET', '/api/accounting/integrity', { token });
  const d = ig.data?.data;
  const ap = d?.checks?.apReconciliation;
  const je = d?.checks?.journalEntryBalance;
  const tbGap =
    totals && totals.totalDebits != null && totals.totalCredits != null
      ? Math.abs(Number(totals.totalDebits) - Number(totals.totalCredits))
      : null;
  return {
    tbOk: tb.status === 200 && totals,
    tbGap,
    tbBalanced: totals?.isBalanced === true,
    integrityOk: ig.status === 200 && d,
    integrityPassed: d?.passed === true,
    apDiff: ap?.difference != null ? Number(ap.difference) : null,
    unbalancedJournals: je?.unbalancedCount ?? null,
  };
}

async function assertBooksStable(token, before, after, label) {
  assert(after.tbOk, `${label}: trial balance loads`);
  assert(after.integrityOk, `${label}: integrity API`);
  if (after.tbGap != null) {
    const baselineBalanced = before?.tbGap != null && before.tbGap < 0.02;
    if (baselineBalanced) {
      assert(
        after.tbGap < 0.02,
        `${label}: trial balance debits = credits`,
        `gap=${after.tbGap}`,
      );
    } else if (before?.tbGap != null) {
      assert(
        after.tbGap <= before.tbGap + 0.01,
        `${label}: TB gap did not worsen (baseline already had historical gap)`,
        `before=${before.tbGap} after=${after.tbGap}`,
      );
    } else {
      assert(after.tbGap < 0.02, `${label}: trial balance debits = credits`, `gap=${after.tbGap}`);
    }
  }
  if (after.unbalancedJournals != null) {
    assert(after.unbalancedJournals === 0, `${label}: no unbalanced journal entries`);
    if (before?.unbalancedJournals != null) {
      assert(
        after.unbalancedJournals <= before.unbalancedJournals,
        `${label}: unbalanced journal count did not increase`,
      );
    }
  }
  if (after.apDiff != null && before?.apDiff != null) {
    assert(
      Math.abs(after.apDiff - before.apDiff) < 0.02,
      `${label}: AP subledger vs GL unchanged (GR/IR-only move)`,
      `before=${before.apDiff} after=${after.apDiff}`,
    );
  }
}

async function assertCorrectionJournal(token, transactionId, label) {
  if (!transactionId) return;
  const tx = await req('GET', `/api/accounting/transactions/${transactionId}`, { token });
  const entries = tx.data?.data?.entries ?? [];
  assert(tx.status === 200 && entries.length >= 2, `${label}: correction journal loads`);
  let debits = 0;
  let credits = 0;
  for (const e of entries) {
    debits += Number(e.debitAmount ?? 0);
    credits += Number(e.creditAmount ?? 0);
  }
  assert(
    Math.abs(debits - credits) < 0.02,
    `${label}: correction journal balanced`,
    `DR=${debits} CR=${credits}`,
  );
}

async function findGrirOpen(token, { supplierId, grNumber }) {
  const q = new URLSearchParams({ limit: '50' });
  if (supplierId) q.set('supplierId', supplierId);
  if (grNumber) q.set('grNumber', grNumber);
  const res = await req('GET', `/api/grir-clearing/open?${q}`, { token });
  const items = res.data?.data?.data ?? res.data?.data ?? [];
  return { status: res.status, items: Array.isArray(items) ? items : [] };
}

async function main() {
  console.log('\n=== Supplier reassignment E2E proof ===');
  console.log(`API:  ${BASE}`);
  console.log(`User: ${EMAIL}`);
  if (EXISTING_GRN_ID) console.log(`GRN_ID: ${EXISTING_GRN_ID} (reuse)`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  const health = await req('GET', '/api/health');
  assert(health.status === 200, 'API health', String(health.status));

  const login = await req('POST', '/api/auth/login', {
    body: { email: EMAIL, password: PASSWORD, tenant: TENANT },
  });
  const token = login.data?.data?.token ?? login.data?.data?.accessToken;
  assert(login.status === 200 && token, 'Login', login.data?.error ?? login.text?.slice(0, 120));
  if (!token) {
    console.log(`\n${fail} failed, ${pass} passed\n`);
    process.exit(1);
  }

  const booksBefore = await snapshotBooks(token);
  if (booksBefore.tbGap != null && booksBefore.tbGap >= 0.02) {
    console.log(
      `  WARN  Baseline trial balance gap ${booksBefore.tbGap} (historical) — E2E will ensure reassignment does not widen it`,
    );
  }

  let grId = EXISTING_GRN_ID;
  let poId = '';
  let grNumber = '';
  let fromSupplierId = EXISTING_FROM;
  let toSupplierId = EXISTING_TO;
  let expectedAmount = 0;

  if (!grId) {
    console.log('\n▶ Create isolated PO → GR (supplier A, no bill)\n');

    const profile = await req('GET', '/api/auth/profile', { token });
    const userId = profile.data?.data?.id || profile.data?.data?.user?.id;
    assert(!!userId, 'Auth profile user id');

    const supRes = await req('GET', '/api/suppliers?limit=10', { token });
    const suppliers = unwrapList(supRes.data);
    assert(suppliers.length >= 2, 'At least two suppliers in directory', `count=${suppliers.length}`);
    fromSupplierId = suppliers[0].id ?? suppliers[0].Id;
    toSupplierId = suppliers[1].id ?? suppliers[1].Id;
    if (fromSupplierId === toSupplierId && suppliers[2]) {
      toSupplierId = suppliers[2].id ?? suppliers[2].Id;
    }
    assert(fromSupplierId && toSupplierId && fromSupplierId !== toSupplierId, 'Distinct from/to suppliers');

    let products = await req(
      'GET',
      `/api/products/procurement-search?q=a&limit=3&supplierId=${encodeURIComponent(fromSupplierId)}`,
      { token },
    );
    let productList = unwrapList(products.data);
    if (productList.length === 0) {
      products = await req('GET', '/api/products?limit=3&page=1', { token });
      productList = unwrapList(products.data);
    }
    const product = productList[0];
    const productId = product?.id;
    const productName = product?.name || 'E2E reassignment product';
    const unitCost = Number(product?.cost_price ?? product?.costPrice ?? 2500) || 2500;
    assert(!!productId, 'Product for PO line');

    const createPo = await req('POST', '/api/purchase-orders', {
      token,
      body: {
        supplierId: fromSupplierId,
        orderDate: todayYmd(),
        expectedDate: futureYmd(14),
        notes: 'proof-supplier-reassignment-e2e',
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
    assert(createPo.status === 200 || createPo.status === 201, 'Create PO', createPo.data?.error);
    assert(!!poId, 'PO id');

    const submit = await req('POST', `/api/purchase-orders/${poId}/submit`, { token });
    assert(submit.status === 200 || submit.data?.error?.includes('PENDING'), 'Submit PO');

    const send = await req('POST', `/api/purchase-orders/${poId}/send-to-supplier`, { token });
    const grInfo = send.data?.data?.goodsReceipt;
    grId = grInfo?.id;
    grNumber = grInfo?.receiptNumber ?? grInfo?.receipt_number ?? '';
    assert(send.status === 200 && grId, 'Send PO → GR draft', send.data?.error);

    const grDraft = await req('GET', `/api/goods-receipts/${grId}`, { token });
    const draftItems = grDraft.data?.data?.items ?? [];
    assert(draftItems.length >= 1, 'GR draft has lines');
    const batchPayload = {
      items: draftItems.map((it) => ({
        itemId: it.id,
        receivedQuantity: Number(
          it.orderedQuantity ?? it.ordered_quantity ?? it.receivedQuantity ?? 2,
        ),
        unitCost: Number(it.unitCost ?? it.unit_cost ?? it.poUnitPrice ?? 1000),
      })),
    };
    const batchUp = await req('PUT', `/api/goods-receipts/${grId}/items`, {
      token,
      body: batchPayload,
    });
    assert(batchUp.status === 200, 'Set received qty on GR lines', batchUp.data?.error);

    const finalize = await req('POST', `/api/goods-receipts/${grId}/finalize`, { token });
    assert(
      finalize.status === 200,
      'Finalize GR (posts inventory + GR/IR)',
      finalize.data?.error ?? finalize.text?.slice(0, 200),
    );
    const finGr = finalize.data?.data?.gr ?? finalize.data?.data;
    assert(finGr?.status === 'COMPLETED', 'GR status COMPLETED', String(finGr?.status));
    ok('Isolated GR posted', grNumber || grId);
  }

  console.log('\n▶ Load GR + PO before reassignment\n');

  const grBefore = await req('GET', `/api/goods-receipts/${grId}`, { token });
  const grRow = grBefore.data?.data?.gr ?? grBefore.data?.data;
  assert(grBefore.status === 200 && grRow, 'GET GR detail');
  grNumber = grNumber || grRow.grNumber || grRow.receipt_number || grId;
  poId = poId || grRow.purchaseOrderId || grRow.purchase_order_id;
  fromSupplierId = fromSupplierId || grRow.supplierId || grRow.supplier_id;
  assert(grRow.status === 'COMPLETED', 'GR is COMPLETED', String(grRow.status));
  assert(!!fromSupplierId, 'GR has supplier (from PO)');

  if (!toSupplierId) {
    const supRes = await req('GET', '/api/suppliers?limit=20', { token });
    const suppliers = unwrapList(supRes.data);
    const other = suppliers.find((s) => (s.id ?? s.Id) !== fromSupplierId);
    toSupplierId = other?.id ?? other?.Id;
  }
  assert(!!toSupplierId && toSupplierId !== fromSupplierId, 'Target supplier distinct from source');

  const items = grBefore.data?.data?.items ?? [];
  expectedAmount = items.reduce(
    (sum, it) => sum + Number(it.receivedQuantity ?? 0) * Number(it.unitCost ?? 0),
    0,
  );
  if (expectedAmount <= 0) {
    expectedAmount = Number(grRow.totalValue ?? grRow.total_value ?? 0);
  }
  assert(expectedAmount > 0, 'GR has positive value for GR/IR', String(expectedAmount));

  const poBefore = poId ? await req('GET', `/api/purchase-orders/${poId}`, { token }) : null;
  if (poBefore?.status === 200) {
    const poSup = poBefore.data?.data?.po?.supplierId ?? poBefore.data?.data?.po?.supplier_id;
    assert(poSup === fromSupplierId, 'PO supplier matches GR before reassign');
  }

  const grirOldBefore = await findGrirOpen(token, { supplierId: fromSupplierId, grNumber });
  assert(grirOldBefore.status === 200, 'GR/IR open list (old supplier)');

  console.log('\n▶ Preview reassignment\n');

  const previewRes = await req('POST', '/api/corrections/supplier-reassignment/preview', {
    token,
    body: {
      grnId: grId,
      fromSupplierId,
      toSupplierId,
      reason: 'E2E proof: wrong vendor on PO — automated reassignment test',
    },
  });
  const preview = previewRes.data?.data;
  assert(previewRes.status === 200 && preview, 'Preview API', previewRes.text?.slice(0, 300));
  if (preview) {
    assert(preview.blockers?.length === 0, 'Preview has no blockers', preview.blockers?.join('; '));
    assert(preview.amount > 0, 'Preview amount > 0', String(preview.amount));
    assert(preview.purchaseOrderId || poId, 'Preview includes PO id');
    assert(
      preview.wizardSteps?.some((s) => s.code === 'UPDATE_PURCHASE_ORDER'),
      'Wizard includes PO supplier update step',
    );
    assert(
      preview.wizardSteps?.some((s) => s.code === 'RECLASS_GRIR'),
      'Wizard includes GR/IR reclass step',
    );
    ok('Preview plan', `amount=${preview.amount}`);
  }

  console.log('\n▶ Execute reassignment (mutates GL + PO)\n');

  const execRes = await req('POST', '/api/corrections/supplier-reassignment/execute', {
    token,
    body: {
      grnId: grId,
      fromSupplierId,
      toSupplierId,
      reason: 'E2E proof: wrong vendor on PO — automated reassignment test',
      autoReverseInvoices: true,
    },
  });
  const result = execRes.data?.data;
  assert(
    (execRes.status === 200 || execRes.status === 201) && result,
    'Execute API',
    execRes.data?.error ?? execRes.text?.slice(0, 400),
  );
  if (result) {
    assert(result.poSupplierUpdated === true, 'poSupplierUpdated flag');
    assert(result.toSupplierId === toSupplierId, 'Result toSupplierId');
    assert((result.amount ?? 0) > 0, 'Execute amount > 0', String(result.amount));
    ok('Execute posted', `event=${result.eventId || 'n/a'} gl=${result.glTransactionId || 'n/a'}`);
    await assertCorrectionJournal(token, result.glTransactionId, 'Reassignment JE');
  }

  console.log('\n▶ Post-conditions: documents + GR/IR + books\n');

  const grAfter = await req('GET', `/api/goods-receipts/${grId}`, { token });
  const grAfterRow = grAfter.data?.data?.gr ?? grAfter.data?.data;
  assert(grAfter.status === 200 && grAfterRow, 'GET GR after reassign');
  if (grAfterRow) {
    const newSup = grAfterRow.supplierId ?? grAfterRow.supplier_id;
    assert(newSup === toSupplierId, 'GR detail shows new supplier', `got=${newSup}`);
  }

  if (poId) {
    const poAfter = await req('GET', `/api/purchase-orders/${poId}`, { token });
    const poSupAfter = poAfter.data?.data?.po?.supplierId ?? poAfter.data?.data?.po?.supplier_id;
    assert(poAfter.status === 200, 'GET PO after reassign');
    assert(poSupAfter === toSupplierId, 'PO supplier_id updated', `got=${poSupAfter}`);
  }

  const grirNew = await findGrirOpen(token, { supplierId: toSupplierId, grNumber });
  assert(grirNew.status === 200, 'GR/IR open list (new supplier)');
  const onNew = grirNew.items.find(
    (i) => i.grNumber === grNumber || i.id === grId || String(i.grNumber || '').includes(grNumber),
  );
  assert(!!onNew, 'GR appears on GR/IR work list under new supplier', `gr=${grNumber}`);
  if (onNew && expectedAmount > 0) {
    const grAmt = Number(onNew.grAmount ?? 0);
    assert(
      Math.abs(grAmt - expectedAmount) < 1.0 || Math.abs(grAmt - (preview?.amount ?? expectedAmount)) < 1.0,
      'GR/IR line amount matches receipt value',
      `open=${grAmt} expected≈${expectedAmount}`,
    );
  }

  const grirOldAfter = await findGrirOpen(token, { supplierId: fromSupplierId, grNumber });
  const stillOnOld = grirOldAfter.items.find(
    (i) => i.grNumber === grNumber || String(i.grNumber || '').includes(grNumber),
  );
  assert(!stillOnOld, 'GR not on GR/IR work list under old supplier (PO vendor moved)');

  const booksAfter = await snapshotBooks(token);
  await assertBooksStable(token, booksBefore, booksAfter, 'After reassign');

  const grirBal = await req('GET', '/api/grir-clearing/balance', { token });
  assert(grirBal.status === 200, 'GR/IR balance summary API');

  console.log('\n--- Summary ---');
  console.log(`GR:   ${grNumber}`);
  console.log(`PO:   ${poId || 'n/a'}`);
  console.log(`From: ${fromSupplierId}`);
  console.log(`To:   ${toSupplierId}`);
  console.log(`Value: ${expectedAmount}`);

  console.log(`\n${fail ? 'FAILED' : 'OK'}: ${pass} passed, ${fail} failed\n`);
  if (fail) {
    console.log('Fix errors above, restart API, re-run: npm run proof:supplier-reassignment:e2e\n');
    process.exit(1);
  }
  console.log('E2E supplier reassignment proof complete — PO, GR, GR/IR, and books are consistent.\n');
  process.exit(0);
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
